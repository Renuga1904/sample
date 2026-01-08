import React, { useState } from "react";
import Modal from "react-modal";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf";
import mammoth from "mammoth";
import './App.css'
Modal.setAppElement("#root");

GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";

const formats = ["image", "pdf", "word"];

export default function App() {
  const [open, setOpen] = useState(false);
  const [fromType, setFromType] = useState("");
  const [toType, setToType] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleConvert = async () => {
    if (!file || !fromType || !toType) {
      alert("Select all fields");
      return;
    }

    setLoading(true);
    setProgress(0);

    try {
      /* IMAGE → EXCEL (Tamil OCR) */
      if (fromType === "image" && toType === "excel") {
        const img = await loadImageToCanvas(file);
        preprocess(img.canvas);

        const result = await Tesseract.recognize(img.canvas, "tam", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(m.progress);
            }
          },
        });

        exportToExcel(result.data.text);
      }

      /* PDF → EXCEL (Tamil OCR) */
      if (fromType === "pdf" && toType === "excel") {
        const buffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: buffer }).promise;

        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 3 }); // HIGH DPI

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: ctx, viewport }).promise;
          preprocess(canvas);

          const result = await Tesseract.recognize(canvas, "tam", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress((i - 1 + m.progress) / pdf.numPages);
              }
            },
          });

          fullText += result.data.text + "\n";
        }

        exportToExcel(fullText);
      }

      /* WORD → EXCEL */
      if (fromType === "word" && toType === "excel") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        exportToExcel(result.value);
      }
    } catch (err) {
      console.error(err);
      alert("OCR failed");
    }

    setLoading(false);
    setProgress(0);
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="btn btn-success fw-bold fs-5 px-4 py-2 rounded-3 shadow"
        >
          Open Converter
        </button>
      )}
      <Modal
        isOpen={open}
        onRequestClose={() => setOpen(false)}
        className="modal-dialog modal-dialog-centered"
        overlayClassName="modal-backdrop fade show"
      >
        <div className="modal-content p-4 rounded-4 shadow-lg">

          {/* Header */}
          <h3 className="text-center fw-bold mb-4">Extractor</h3>

          {/* Form */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold">From</label>
              <select
                value={fromType}
                className="form-select"
                onChange={(e) => setFromType(e.target.value)}
              >
                <option value="">Select format</option>
                {formats.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label fw-semibold">To</label>
              <select
                value={toType}
                className="form-select"
                onChange={(e) => setToType(e.target.value)}
              >
                <option value="">Select format</option>
                <option value="excel">Excel</option>
              </select>
            </div>

            <div className="col-12">
              <label className="form-label fw-semibold">Upload File</label>
              <input
                type="file"
                className="form-control"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </div>
          </div>

          {/* Progress */}
          {loading && (
            <div className="mb-3">
              <div className="progress">
                <div
                  className="progress-bar progress-bar-striped progress-bar-animated"
                  role="progressbar"
                  style={{ width: `${progress * 100}%` }}
                >
                  {(progress * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="d-flex justify-content-between mt-4">
            <button
              onClick={handleConvert}
              disabled={loading}
              className="btn btn-primary px-4 fw-semibold"
            >
              {loading ? "Processing..." : "Convert"}
            </button>

            <button
              onClick={() => setOpen(false)}
              className="btn btn-outline-danger px-4 fw-semibold"
            >
              Close
            </button>
          </div>

        </div>
      </Modal>
    </div>

  );
}


function loadImageToCanvas(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = () => (img.src = reader.result);
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      resolve({ canvas });
    };
  });
}

function preprocess(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const v = gray > 145 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(img, 0, 0);
}

function exportToExcel(text) {
  const rows = text
    .split("\n")
    .filter(Boolean)
    .map((line) => [line]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tamil_OCR");

  XLSX.writeFile(wb, "tamil_ocr.xlsx");
}