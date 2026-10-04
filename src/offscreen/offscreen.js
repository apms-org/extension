function write(text) {
  const onCopy = (e) => { e.clipboardData.setData("text/plain", text); e.preventDefault(); };
  document.addEventListener("copy", onCopy, true);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
  document.removeEventListener("copy", onCopy, true);
  return ok;
}

function read() {
  const ta = document.createElement("textarea");
  document.body.appendChild(ta);
  ta.focus();
  let v = null;
  try { if (document.execCommand("paste")) v = ta.value; } catch (e) { v = null; }
  ta.remove();
  return v;
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.target !== "offscreen" || sender.id !== chrome.runtime.id) return;
  if (msg.t === "write") respond({ ok: write(msg.text) });
  else if (msg.t === "clear") {
    const cur = read();
    if (cur === null || cur === msg.expect) write("");
    respond({ ok: true, cleared: cur === null || cur === msg.expect });
  }
});
