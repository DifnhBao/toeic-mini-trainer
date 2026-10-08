"use client";
import { useState } from "react";
import Link from "next/link";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!file) return alert("Vui lòng chọn file JSON");

    setLoading(true);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Parse để đảm bảo file là JSON hợp lệ trước khi gửi lên server
        const jsonContent = JSON.parse(e.target?.result as string);

        const res = await fetch("/api/import/questions-json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jsonContent),
        });

        const data = await res.json();
        if (data.error) {
          setResult(`Lỗi: ${data.error}`);
        } else {
          setResult(
            `🎉 Thành công! Đã thêm ${data.questionsAdded} câu hỏi mới vào Database.`,
          );
        }
      } catch {
        setResult("Lỗi: File tải lên không đúng định dạng JSON hợp lệ.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 mt-10">
      <div className="bg-white p-8 rounded-xl shadow-sm border">
        <h1 className="text-2xl font-bold mb-2">Kho dữ liệu TOEIC</h1>
        <p className="text-gray-500 mb-6">
          JSON được lưu vào kho cá nhân của quản trị viên. Để tạo bài có audio cho người học, dùng luồng nhập đề và xuất bản vào kho chung.
        </p>
        <Link className="mb-6 inline-block font-semibold text-blue-700 underline" href="/admin/extract">Nhập đề & audio cho kho chung →</Link>

        <div className="flex flex-col gap-5">
          <label className="block">
            <span className="sr-only">Chọn file JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer transition-colors"
            />
          </label>

          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading
              ? "Đang xử lý dữ liệu..."
              : "Tải lên & Import vào Database"}
          </button>
        </div>

        {result && (
          <div
            className={`mt-6 p-4 rounded-lg font-medium border ${
              result.includes("Thành công")
                ? "bg-green-50 text-green-800 border-green-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}
          >
            {result}
          </div>
        )}
      </div>
    </div>
  );
}
