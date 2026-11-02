/**
 * curl 命令解析器
 *
 * 把一段 curl 命令文本解析成 { url, method, headers, body, warnings }，
 * 供 popup 快速回填表单。同时兼容浏览器与 Node（用于单元测试）。
 *
 * 支持的常见写法：
 *   curl 'https://a.com/path' -X POST -H 'Content-Type: application/json' -d '{"k":1}'
 *   curl --url https://a.com -H "A: b" --data-raw '...' --json '...'
 *   curl -u user:pass -A 'UA' -b 'k=v' -e https://ref.com ...
 *   多行续行（行尾 \）、$'...' ANSI-C 引号、管道后续命令（| jq .）会被截断
 */
(function (global) {
  "use strict";

  // 需要消费一个取值的参数（未单独处理的走这里，值被丢弃）
  var VALUE_FLAGS = new Set([
    "-x", "--proxy", "-X", "--request", "-H", "--header",
    "-d", "--data", "--data-ascii", "--data-raw", "--data-binary", "--data-urlencode",
    "--json", "-b", "--cookie", "-c", "--cookie-jar", "-u", "--user",
    "-A", "--user-agent", "-e", "--referer", "--url", "-F", "--form",
    "-T", "--upload-file", "-o", "--output", "-D", "--dump-header",
    "-m", "--max-time", "--connect-timeout", "--retry", "--retry-delay",
    "--retry-max-time", "--resolve", "--connect-to", "--cert", "-E", "--key",
    "--cacert", "--capath", "-r", "--range", "-U", "--proxy-user",
    "-w", "--write-out", "--interface", "--limit-rate", "--max-filesize",
    "--speed-limit", "--speed-time", "-z", "--time-cond", "-K", "--config",
    "--trace", "--trace-ascii", "--stderr", "--unix-socket",
    "--abstract-unix-socket", "--oauth2-bearer", "--output-dir",
    "--create-file-mode", "--url-query", "--variable", "--expand-data",
    "-C", "--continue-at", "--hsts", "--netrc-file", "--proxy-header",
    "--proto", "--proto-redir", "--request-target", "--tlsuser",
    "--tlspassword",
  ]);

  // 空标记为 true 的布尔型短选项，可合并书写（如 -sSL）
  var BOOLEAN_SHORT = "sSILkvifN46";

  // 出现在命令开头、应被跳过的包装命令
  var SKIP_TOKENS = new Set(["sudo", "env", "time", "nohup", "exec", "$", "#"]);

  var DATA_FLAGS = ["-d", "--data", "--data-ascii", "--data-raw", "--data-binary", "--data-urlencode"];

  function ansiEscape(ch) {
    switch (ch) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "0": return "\0";
      case "a": return "\x07";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "e": return "\x1b";
      case "\\": return "\\";
      case "'": return "'";
      case '"': return '"';
      default: return ch === undefined ? "" : ch;
    }
  }

  /** 按 shell 规则切词：处理单/双引号、$'...'、反斜杠续行与转义，遇管道等操作符截断 */
  function tokenize(input) {
    var tokens = [];
    var cur = null;
    var i = 0;
    var n = input.length;

    function flush() {
      if (cur !== null) {
        tokens.push(cur);
        cur = null;
      }
    }

    while (i < n) {
      var ch = input[i];

      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        flush();
        i += 1;
        continue;
      }

      if (ch === "\\") {
        var next = input[i + 1];
        if (next === "\n") { i += 2; continue; }             // 续行
        if (next === "\r" && input[i + 2] === "\n") { i += 3; continue; }
        if (cur === null) cur = "";
        cur += next === undefined ? "" : next;
        i += 2;
        continue;
      }

      if (ch === "'") {
        if (cur === null) cur = "";
        var end = input.indexOf("'", i + 1);
        cur += end === -1 ? input.slice(i + 1) : input.slice(i + 1, end);
        i = end === -1 ? n : end + 1;
        continue;
      }

      if (ch === "$" && input[i + 1] === "'") {
        if (cur === null) cur = "";
        i += 2;
        while (i < n && input[i] !== "'") {
          if (input[i] === "\\") {
            cur += ansiEscape(input[i + 1]);
            i += 2;
          } else {
            cur += input[i];
            i += 1;
          }
        }
        i += 1; // 跳过收尾单引号
        continue;
      }

      if (ch === '"') {
        if (cur === null) cur = "";
        i += 1;
        while (i < n && input[i] !== '"') {
          if (input[i] === "\\") {
            var e = input[i + 1];
            if (e === "\n") { i += 2; continue; }
            if (e !== undefined && '"\\$`'.indexOf(e) > -1) { cur += e; i += 2; continue; }
            if (e === "n") { cur += "\n"; i += 2; continue; }
            if (e === "t") { cur += "\t"; i += 2; continue; }
            cur += "\\" + (e === undefined ? "" : e);
            i += 2;
            continue;
          }
          cur += input[i];
          i += 1;
        }
        i += 1;
        continue;
      }

      // 未加引号的 shell 操作符：命令在此结束（后面的管道/重定向一律忽略）
      if (ch === "|" || ch === "&" || ch === ";" || ch === ">" || ch === "<") {
        flush();
        return tokens;
      }

      if (cur === null) cur = "";
      cur += ch;
      i += 1;
    }

    flush();
    return tokens;
  }

  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k]);
    if (typeof global.btoa === "function") return global.btoa(bin);
    return Buffer.from(str, "utf8").toString("base64");
  }

  function encodeUrlEncodedPart(raw) {
    var eq = raw.indexOf("=");
    if (eq === -1) return encodeURIComponent(raw);
    return raw.slice(0, eq) + "=" + encodeURIComponent(raw.slice(eq + 1));
  }

  function normalizeUrl(raw, warnings) {
    var url = raw.trim();
    if (/^https?:\/\//i.test(url) || /^wss?:\/\//i.test(url)) return url;
    var isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
    var full = (isLocal ? "http://" : "https://") + url;
    warnings.push("URL 未写协议，已按 " + (isLocal ? "http://" : "https://") + " 补全");
    return full;
  }

  function parseHeaders(value, headers, warnings) {
    if (value.indexOf(":") === -1) {
      // curl 里 'Key;' 表示发送一个空值 header
      if (/;\s*$/.test(value)) {
        headers.push([value.replace(/;\s*$/, "").trim(), ""]);
        return;
      }
      warnings.push('无法解析的 header「' + value + '」，已忽略');
      return;
    }
    var idx = value.indexOf(":");
    headers.push([value.slice(0, idx).trim(), value.slice(idx + 1).trim()]);
  }

  function parseCurl(input) {
    var warnings = [];
    var text = String(input || "");
    if (!text.trim()) throw new Error("请先粘贴 curl 命令");

    var tokens = tokenize(text);
    if (!tokens.length) throw new Error("没有解析出任何内容，请检查命令");

    var start = 0;
    var curlIdx = -1;
    for (var t = 0; t < tokens.length; t++) {
      if (/^curl(\.exe)?$/i.test(tokens[t])) { curlIdx = t; break; }
    }
    if (curlIdx > -1) start = curlIdx + 1;

    var url = "";
    var method = "";
    var inline; // 与 --flag=value / -d'xxx' 紧贴写法共享，循环内每轮重置
    var headers = [];
    var dataParts = [];
    var hasJson = false;
    var asGet = false;
    var isHead = false;

    var i = start;
    while (i < tokens.length) {
      var raw = tokens[i];
      var flag = raw;
      inline = undefined; // 每轮必须重置：var 声明在函数作用域，否则会残留上一轮的值

      if (raw.slice(0, 2) === "--") {
        var eq = raw.indexOf("=");
        if (eq > -1) {
          flag = raw.slice(0, eq);
          inline = raw.slice(eq + 1);
        }
      } else if (/^-[A-Za-z]/.test(raw) && raw.length > 2) {
        var allBoolean = /^-[A-Za-z]+$/.test(raw) && raw.slice(1).split("").every(function (c) {
          return BOOLEAN_SHORT.indexOf(c) > -1;
        });
        if (!allBoolean) {
          // 形如 -H'x:1' / -d'{"a":1}'：短选项紧贴取值
          flag = raw.slice(0, 2);
          inline = raw.slice(2);
        }
      }

      var take = function (f) {
        if (inline !== undefined) return inline;
        i += 1;
        if (i >= tokens.length) throw new Error("参数 " + f + " 缺少取值");
        return tokens[i];
      };

      if (flag === "-X" || flag === "--request") {
        method = take(flag).toUpperCase();
      } else if (flag === "-H" || flag === "--header") {
        parseHeaders(take(flag), headers, warnings);
      } else if (DATA_FLAGS.indexOf(flag) > -1) {
        var v = take(flag);
        if (/^@/.test(v)) {
          warnings.push("请求体引用了本地文件（" + v + "），无法读取内容，请手动粘贴");
        } else {
          dataParts.push({ kind: flag, value: v });
        }
      } else if (flag === "--json") {
        hasJson = true;
        dataParts.push({ kind: "--json", value: take(flag) });
      } else if (flag === "-G" || flag === "--get") {
        asGet = true;
      } else if (flag === "-I" || flag === "--head") {
        isHead = true;
      } else if (flag === "-b" || flag === "--cookie") {
        var cookie = take(flag);
        if (cookie.indexOf("=") > -1) headers.push(["Cookie", cookie]);
        else warnings.push("cookie 来自文件（" + cookie + "），已忽略");
      } else if (flag === "-u" || flag === "--user") {
        headers.push(["Authorization", "Basic " + toBase64(take(flag))]);
      } else if (flag === "-A" || flag === "--user-agent") {
        headers.push(["User-Agent", take(flag)]);
      } else if (flag === "-e" || flag === "--referer") {
        headers.push(["Referer", take(flag)]);
      } else if (flag === "--url") {
        url = normalizeUrl(take(flag), warnings);
      } else if (flag === "-F" || flag === "--form") {
        take(flag);
        warnings.push("暂不支持 multipart 表单（-F），该项已忽略");
      } else if (flag === "-T" || flag === "--upload-file") {
        take(flag);
        warnings.push("暂不支持文件上传（-T），该项已忽略");
      } else if (VALUE_FLAGS.has(flag)) {
        take(flag); // 已知但无需映射的参数，吞掉取值
      } else if (flag.charAt(0) === "-") {
        var combined = /^-[A-Za-z]{2,}$/.test(flag) && flag.slice(1).split("").every(function (c) {
          return BOOLEAN_SHORT.indexOf(c) > -1;
        });
        if (!combined) warnings.push("未识别的参数 " + flag + "，已忽略");
      } else if (SKIP_TOKENS.has(raw.toLowerCase())) {
        // 包装命令，忽略
      } else if (!url) {
        url = normalizeUrl(raw, warnings);
      } else {
        warnings.push("多余的参数「" + raw + "」，已忽略");
      }

      i += 1;
    }

    var body = dataParts
      .filter(function (p) { return !(p.kind !== "--json" && /^@/.test(p.value)); })
      .map(function (p) {
        return p.kind === "--data-urlencode" ? encodeUrlEncodedPart(p.value) : p.value;
      })
      .join("&");

    if (asGet && body) {
      url += (url.indexOf("?") > -1 ? "&" : "?") + body;
      body = "";
    }

    if (hasJson) {
      var hasCT = headers.some(function (h) { return h[0].toLowerCase() === "content-type"; });
      var hasAccept = headers.some(function (h) { return h[0].toLowerCase() === "accept"; });
      if (!hasCT) headers.push(["Content-Type", "application/json"]);
      if (!hasAccept) headers.push(["Accept", "application/json"]);
    }

    var finalMethod = method;
    if (!finalMethod) {
      if (isHead) finalMethod = "HEAD";
      else if (dataParts.length && !asGet) finalMethod = "POST";
      else finalMethod = "GET";
    }

    if (!url) throw new Error("没有解析出 URL，请检查命令是否完整");

    return {
      url: url,
      method: finalMethod,
      headers: headers,
      body: body,
      warnings: warnings,
    };
  }

  global.parseCurl = parseCurl;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseCurl: parseCurl, tokenize: tokenize };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
