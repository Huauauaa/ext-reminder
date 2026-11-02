const $ = (id) => document.getElementById(id);

// ---------- cURL 导入 ----------

const importPanel = $("import-panel");

$("toggle-import").addEventListener("click", () => {
  const isHidden = importPanel.classList.toggle("hidden");
  if (!isHidden) $("curl-input").focus();
});

$("clear-curl").addEventListener("click", () => {
  $("curl-input").value = "";
  $("import-msg").textContent = "";
  $("import-warnings").innerHTML = "";
  $("curl-input").focus();
});

$("do-import").addEventListener("click", applyCurlImport);

// Cmd/Ctrl + Enter 直接导入
$("curl-input").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    applyCurlImport();
  }
});

function applyCurlImport() {
  const msg = $("import-msg");
  const warnBox = $("import-warnings");
  warnBox.innerHTML = "";

  try {
    const result = parseCurl($("curl-input").value);
    fillForm(result);

    msg.textContent = result.warnings.length
      ? `已填入表单（${result.warnings.length} 条提示）`
      : "已填入表单";
    msg.className = "status ok";

    result.warnings.forEach((w) => {
      const line = document.createElement("div");
      line.textContent = w;
      warnBox.appendChild(line);
    });
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "status err";
  }
}

/** 把解析结果写回表单：URL / Method / Headers 行 / Body */
function fillForm({ url, method, headers, body }) {
  $("url").value = url || "";

  const select = $("method");
  const m = (method || "GET").toUpperCase();
  if (![...select.options].some((opt) => opt.value === m)) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
  select.value = m;

  $("headers-list").innerHTML = "";
  headers.forEach(([key, value]) => addHeaderRow(key, value));
  if (!headers.length) addHeaderRow();

  $("body").value = body || "";
}

// ---------- Headers 行管理 ----------

function addHeaderRow(key = "", value = "") {
  const row = document.createElement("div");
  row.className = "header-row";

  const keyInput = document.createElement("input");
  keyInput.type = "text";
  keyInput.className = "h-key";
  keyInput.placeholder = "Header 名称";
  keyInput.value = key;

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "h-value";
  valueInput.placeholder = "Header 值";
  valueInput.value = value;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.type = "button";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(keyInput, valueInput, removeBtn);
  $("headers-list").appendChild(row);
}

$("add-header").addEventListener("click", () => addHeaderRow());

// ---------- 收集表单数据 ----------

function collectHeaders() {
  const headers = {};
  document.querySelectorAll("#headers-list .header-row").forEach((row) => {
    const key = row.querySelector(".h-key").value.trim();
    const value = row.querySelector(".h-value").value.trim();
    if (key) headers[key] = value;
  });
  return headers;
}

// ---------- 发送请求 ----------

$("send").addEventListener("click", async () => {
  const url = $("url").value.trim();
  if (!url) {
    alert("请输入 URL");
    return;
  }

  const method = $("method").value;
  const headers = collectHeaders();
  const bodyText = $("body").value;

  const options = { method, headers };
  // GET/HEAD 不能携带 body
  if (!["GET", "HEAD"].includes(method) && bodyText.trim()) {
    options.body = bodyText;
  }

  const sendBtn = $("send");
  sendBtn.disabled = true;
  sendBtn.textContent = "Sending...";

  const startedAt = performance.now();

  try {
    const res = await fetch(url, options);
    const elapsed = Math.round(performance.now() - startedAt);

    const statusEl = $("status");
    statusEl.textContent = `${res.status} ${res.statusText}`;
    statusEl.className = "status " + (res.ok ? "ok" : "err");

    $("time").textContent = `${elapsed} ms`;

    const text = await res.text();
    try {
      $("response").value = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      $("response").value = text;
    }
  } catch (err) {
    const statusEl = $("status");
    statusEl.textContent = "请求失败";
    statusEl.className = "status err";
    $("time").textContent = "";
    $("response").value = String(err);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
});
