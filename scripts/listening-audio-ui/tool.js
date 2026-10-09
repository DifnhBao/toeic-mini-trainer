import { parseTime as parse, formatTime as time } from "./time.mjs";
const key = new URLSearchParams(location.search).get("key");
const element = id => document.getElementById(id);
const audio = element("audio");
let state, active, previewEnd = null, busy = false;
function status(message, error = false) { element("status").textContent = message; element("status").dataset.error = String(error); }
async function request(route, segment) {
  const response = await fetch(`${route}?key=${key}`, segment ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(segment) } : {});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Không thể xử lý audio.");
  return data;
}
function segment() {
  const start = parse(element("start").value), end = parse(element("end").value);
  if (start < 0 || end <= start || end > state.duration || end - start > 600) throw Error("Chọn đầu < cuối trong file, đoạn tối đa 10 phút.");
  return { ...active, start, end, reviewed: element("reviewed").checked };
}
function stopPreview() { if (previewEnd !== null) audio.pause(); previewEnd = null; }
function changed() {
  stopPreview(); element("reviewed").checked = false; element("export").disabled = true; element("result").replaceChildren();
  try { const s = segment(); element("length").textContent = `Độ dài đoạn: ${(s.end - s.start).toFixed(3)} giây`; }
  catch { element("length").textContent = "Chưa chọn đủ mốc hợp lệ."; }
}
function renderGroups() {
  const root = element("groups"); root.replaceChildren();
  for (let part = 1; part <= 4; part++) {
    const heading = document.createElement("strong"); heading.textContent = `Part ${part}`; root.append(heading);
    const grid = document.createElement("div"); grid.className = "group-list";
    for (const group of state.groups.filter(group => group.part === part)) {
      const button = document.createElement("button");
      const saved = state.segments.find(s => s.first === group.first);
      button.textContent = `${group.first === group.last ? group.first : `${group.first}–${group.last}`}${saved ? saved.reviewed ? " ✓" : " •" : ""}`;
      button.setAttribute("aria-label", `Part ${part}, câu ${group.first} đến ${group.last}${saved ? ", đã lưu mốc" : ""}`);
      button.setAttribute("aria-current", String(group.first === active?.first));
      button.disabled = busy;
      button.onclick = () => select(group); grid.append(button);
    }
    root.append(grid);
  }
  element("progress").textContent = `${state.segments.length}/54 nhóm đã lưu mốc · ${state.segments.filter(s => s.reviewed).length} đã xác nhận nghe.`;
}
function select(group) {
  stopPreview(); audio.pause(); active = group;
  const saved = state.segments.find(s => s.first === group.first);
  element("title").textContent = `Part ${group.part} · ${group.first === group.last ? `Câu ${group.first}` : `Câu ${group.first}–${group.last}`}`;
  element("start").value = saved ? time(saved.start) : ""; element("end").value = saved ? time(saved.end) : "";
  changed(); element("reviewed").checked = saved?.reviewed || false; element("export").disabled = !saved?.reviewed;
  status(saved ? "Đã mở mốc đã lưu. Có thể nghe kiểm tra hoặc chỉnh lại." : "Tìm đúng câu trong audio gốc rồi đánh dấu đầu/cuối.");
  renderGroups();
}
element("start").oninput = element("end").oninput = changed;
element("mark-start").onclick = () => { element("start").value = time(audio.currentTime); changed(); };
element("mark-end").onclick = () => { element("end").value = time(audio.currentTime); changed(); };
element("reviewed").onchange = () => { element("export").disabled = busy || !element("reviewed").checked; };
element("go").onclick = () => { try { const position = parse(element("seek").value); if (position > state.duration) throw Error("Vị trí nằm ngoài file."); stopPreview(); audio.currentTime = position; } catch (error) { status(error.message, true); } };
element("back").onclick = () => { stopPreview(); audio.currentTime = Math.max(0, audio.currentTime - 5); };
element("forward").onclick = () => { stopPreview(); audio.currentTime = Math.min(state.duration, audio.currentTime + 5); };
element("speed").onchange = () => { audio.playbackRate = Number(element("speed").value); };
element("preview").onclick = async () => {
  try { const s = segment(); audio.pause(); audio.currentTime = s.start; previewEnd = s.end; await audio.play(); status(`Đang nghe thử ${time(s.start)} → ${time(s.end)}.`); }
  catch (error) { previewEnd = null; status(error.message, true); }
};
audio.ontimeupdate = () => { if (previewEnd !== null && audio.currentTime >= previewEnd) { audio.pause(); previewEnd = null; status("Đã nghe đến cuối đoạn. Kiểm tra số câu và toàn bộ lựa chọn trước khi xác nhận."); } };
audio.onerror = () => { previewEnd = null; status("Không mở được audio. Hãy tải lại đúng liên kết công cụ và kiểm tra file nguồn.", true); };
async function persist(exporting) {
  if (busy) return;
  try {
    const s = segment(); busy = true; stopPreview(); audio.pause();
    for (const control of document.querySelectorAll("button,input,select")) control.disabled = true;
    status(exporting ? "Đang cắt và kiểm tra MP3…" : "Đang lưu mốc…");
    const result = await request(exporting ? "/export" : "/save", s); state.segments = result.segments;
    status(exporting ? `Đã xuất ${result.fileName}. Nghe file vừa cắt ở bên dưới, rồi gắn vào đúng nhóm trên web.` : "Đã lưu mốc trên máy. Mở lại công cụ với cùng file và thư mục để làm tiếp.");
    if (exporting) {
      const root = element("result"); root.replaceChildren();
      const player = document.createElement("audio"); player.controls = true; player.preload = "none"; player.src = `/clip/${result.fileName}?key=${key}`;
      const link = document.createElement("a"); link.href = player.src; link.download = result.fileName; link.textContent = `Tải ${result.fileName}`;
      root.append(player, link);
    }
  } catch (error) { status(error.message, true); }
  finally {
    busy = false; for (const control of document.querySelectorAll("button,input,select")) control.disabled = false;
    element("export").disabled = !element("reviewed").checked; renderGroups();
  }
}
element("save").onclick = () => persist(false); element("export").onclick = () => persist(true);
request("/state").then(data => {
  state = data; element("source").textContent = `${data.sourceFile} · ${time(data.duration)} · file gốc`;
  element("output").textContent = `Nơi lưu MP3 và mốc cắt: ${data.output}`;
  audio.src = `/audio?key=${key}`; select(data.groups[0]);
}).catch(error => status(error.message, true));
