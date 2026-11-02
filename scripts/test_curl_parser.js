/**
 * curl 解析器单元测试：node scripts/test_curl_parser.js
 */
const { parseCurl } = require("../curl-parser.js");

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        期望 ${e}\n        实际 ${a}`);
  }
}

function headerMap(headers) {
  return headers.map(([k, v]) => `${k}=${v}`);
}

console.log("\n[1] 最简 GET");
{
  const r = parseCurl("curl https://httpbin.org/get");
  check("url", r.url, "https://httpbin.org/get");
  check("method", r.method, "GET");
  check("headers", r.headers, []);
  check("body", r.body, "");
}

console.log("\n[2] POST JSON（单引号 + 多 header）");
{
  const r = parseCurl(
    `curl 'https://api.example.com/users' -H 'Content-Type: application/json' -H 'X-Token: abc' -d '{"name":"harvey"}'`
  );
  check("url", r.url, "https://api.example.com/users");
  check("method", r.method, "POST");
  check("headers", headerMap(r.headers), ["Content-Type=application/json", "X-Token=abc"]);
  check("body", r.body, '{"name":"harvey"}');
}

console.log("\n[3] 多行续行 + 反斜杠");
{
  const r = parseCurl(`curl -X PUT https://a.com/v1/item/1 \\
  -H "Authorization: Bearer tok_123" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"x"}'`);
  check("method", r.method, "PUT");
  check("headers", headerMap(r.headers), ["Authorization=Bearer tok_123", "Content-Type=application/json"]);
  check("body", r.body, '{"title":"x"}');
  check("warnings", r.warnings, []);
}

console.log("\n[4] --json 快捷参数自动补 Content-Type / Accept");
{
  const r = parseCurl(`curl --json '{"a":1}' https://a.com/x`);
  check("method", r.method, "POST");
  check("headers", headerMap(r.headers), ["Content-Type=application/json", "Accept=application/json"]);
  check("body", r.body, '{"a":1}');
}

console.log("\n[5] -u 生成 Basic 认证头");
{
  const r = parseCurl("curl -u user:pass https://a.com/secret");
  check("headers", headerMap(r.headers), ["Authorization=Basic dXNlcjpwYXNz"]);
}

console.log("\n[6] -b cookie / -A / -e");
{
  const r = parseCurl(`curl -b 'sid=1; theme=dark' -A 'curl-test/1.0' -e https://ref.com https://a.com/`);
  check("headers", headerMap(r.headers), [
    "Cookie=sid=1; theme=dark",
    "User-Agent=curl-test/1.0",
    "Referer=https://ref.com",
  ]);
}

console.log("\n[7] -G 把 -d 转成 query string");
{
  const r = parseCurl(`curl -G https://a.com/search -d 'q=hello' -d 'page=2'`);
  check("method", r.method, "GET");
  check("url", r.url, "https://a.com/search?q=hello&page=2");
  check("body", r.body, "");
}

console.log("\n[8] $'...' ANSI-C 引号里的换行");
{
  const r = parseCurl(`curl https://a.com -d $'line1\\nline2'`);
  check("body", r.body, "line1\nline2");
}

console.log("\n[9] 管道后续命令被截断");
{
  const r = parseCurl(`curl https://a.com/api -H 'Accept: application/json' | jq .`);
  check("url", r.url, "https://a.com/api");
  check("headers", headerMap(r.headers), ["Accept=application/json"]);
  check("warnings", r.warnings, []);
}

console.log("\n[10] -I 推断 HEAD");
{
  const r = parseCurl("curl -I https://a.com");
  check("method", r.method, "HEAD");
}

console.log("\n[11] 短选项紧贴取值 -d'...' -H'...'");
{
  const r = parseCurl(`curl https://a.com -H'Content-Type: text/plain' -d'hello'`);
  check("headers", headerMap(r.headers), ["Content-Type=text/plain"]);
  check("body", r.body, "hello");
}

console.log("\n[12] 无协议 URL 自动补全");
{
  const r = parseCurl("curl localhost:3000/api/ping");
  check("url", r.url, "http://localhost:3000/api/ping");
  check("warnCount", r.warnings.length, 1);
}

console.log("\n[13] 合并布尔短选项 -sSL 被忽略");
{
  const r = parseCurl("curl -sSL https://a.com");
  check("url", r.url, "https://a.com");
  check("warnings", r.warnings, []);
}

console.log("\n[14] --data-urlencode 编码值");
{
  const r = parseCurl(`curl https://a.com -d 'a=1' --data-urlencode 'name=张 三'`);
  check("body", r.body, "a=1&name=%E5%BC%A0%20%E4%B8%89");
}

console.log("\n[15] -F 表单给出提示且不产生 body");
{
  const r = parseCurl(`curl https://a.com -F 'file=@a.png' -F 'name=x'`);
  check("body", r.body, "");
  check("method", r.method, "GET");
  check("warnCount", r.warnings.length, 2);
}

console.log("\n[16] sudo 前缀 / --url / --flag=value 形式");
{
  const r = parseCurl(`sudo curl --request=DELETE --url https://a.com/item/1 --header='X-A: 1'`);
  check("method", r.method, "DELETE");
  check("url", r.url, "https://a.com/item/1");
  check("headers", headerMap(r.headers), ["X-A=1"]);
}

console.log("\n[17] 空输入与无 URL 报错");
{
  let err1 = "";
  let err2 = "";
  try { parseCurl("   "); } catch (e) { err1 = e.message; }
  try { parseCurl("curl -H 'A: b'"); } catch (e) { err2 = e.message; }
  check("空输入报错", err1.length > 0, true);
  check("无 URL 报错", err2.includes("URL"), true);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
