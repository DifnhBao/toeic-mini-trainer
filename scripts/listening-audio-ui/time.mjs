/** @param {string} input */
export function parseTime(input) {
  const parts = input.trim().split(":");
  if (parts.length > 3 || !parts.every(part => /^\d+(\.\d{1,3})?$/.test(part))) throw new Error("Nhập giây hoặc mm:ss / hh:mm:ss, có thể thêm .mmm.");
  if (parts.slice(0, -1).some(part => part.includes(".")) || parts.slice(1).some(part => Number(part) >= 60)) throw new Error("Phần giây/phút sau dấu : phải nhỏ hơn 60.");
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

/** @param {number} seconds */
export function formatTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  return `${minutes}:${((milliseconds - minutes * 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
