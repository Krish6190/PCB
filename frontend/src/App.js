import React, { useState, useEffect } from "react";
import "./App.css";

/* ──────────── SEVERITY MAP (shared) ──────────── */
const SEVERITY_MAP = {
  missing_hole:    { weight: 8,  impact: "High",     description: "Missing drill hole — affects connectivity and component mounting" },
  mouse_bite:      { weight: 5,  impact: "Medium",   description: "Irregular rough edge — may cause electrical shorts over time" },
  open_circuit:    { weight: 10, impact: "Critical", description: "Broken trace — circuit will not function at all" },
  short:           { weight: 10, impact: "Critical", description: "Unintended connection — risk of component damage or fire" },
  spur:            { weight: 6,  impact: "Medium",   description: "Unwanted copper projection — potential short circuit risk" },
  spurious_copper: { weight: 7,  impact: "High",     description: "Extra copper residue — risk of trace bridging" },
};

const GRADE_EXPLANATIONS = [
  { grade: "A+", range: "0",       color: "#00e676", meaning: "Excellent — No defects detected. PCB is in perfect condition and fully production-ready." },
  { grade: "A",  range: "1 – 10",  color: "#66bb6a", meaning: "Very Good — Only minor cosmetic issues. PCB is fully functional with negligible imperfections." },
  { grade: "B",  range: "11 – 25", color: "#ffee58", meaning: "Good — Minor defects present but PCB is likely functional. Suitable for non-critical applications." },
  { grade: "C",  range: "26 – 45", color: "#ffa726", meaning: "Fair — Moderate defects found. PCB needs review and may require rework before use." },
  { grade: "D",  range: "46 – 65", color: "#ef5350", meaning: "Poor — Significant defects detected. PCB is unreliable and requires major rework." },
  { grade: "F",  range: "66 – 100",color: "#d32f2f", meaning: "Fail — Critical defects present. PCB is not usable and should be rejected/scrapped." },
];

const IMPACT_SCORES = [
  { level: "Critical", score: "9 – 10", color: "#d32f2f", desc: "Complete functional failure. PCB cannot operate." },
  { level: "High",     score: "7 – 8",  color: "#ef5350", desc: "Major functionality at risk. Needs immediate attention." },
  { level: "Medium",   score: "5 – 6",  color: "#ffa726", desc: "Partial risk. May degrade over time or under stress." },
  { level: "Low",      score: "1 – 4",  color: "#66bb6a", desc: "Cosmetic or negligible. Unlikely to affect function." },
];

function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScoreChart, setShowScoreChart] = useState(false);
  const [showGradeChart, setShowGradeChart] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => { setAnimateIn(true); }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    setResultImage(null);
    setReport(null);
  };

  // ---------- AUTO-CROP PCB ----------
  const autoCropPCB = async (img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const greenStrong = g > r * 1.2 && g > b * 1.2 && g > 60;
        const nonSkin = !(r > 90 && g > 40 && b < 100);
        const notKeyboard = !(r < 50 && g < 50 && b < 50);
        if (greenStrong && nonSkin && notKeyboard) mask[y * width + x] = 1;
      }
    }
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x]) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return img;
    const pad = 30;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width, maxX + pad); maxY = Math.min(height, maxY + pad);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = maxX - minX; cropCanvas.height = maxY - minY;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(img, minX, minY, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);
    return new Promise((resolve) => {
      const cropped = new Image();
      cropped.src = cropCanvas.toDataURL("image/png");
      cropped.onload = () => resolve(cropped);
    });
  };

  // ---------- EDGE DENSITY ----------
  const estimateEdgeDensity = async (img) => {
    const W = img.width, H = img.height;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;
    const gray = new Float32Array(W * H);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const sobelMag = new Float32Array(W * H);
    let maxMag = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        let gx = 0, gy = 0, idx = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const v = gray[(y + ky) * W + (x + kx)];
            gx += sobelX[idx] * v; gy += sobelY[idx] * v; idx++;
          }
        }
        const mag = Math.hypot(gx, gy);
        sobelMag[y * W + x] = mag;
        if (mag > maxMag) maxMag = mag;
      }
    }
    let edgeCount = 0;
    for (let i = 0; i < sobelMag.length; i++) {
      if (sobelMag[i] / (maxMag || 1) > 0.25) edgeCount++;
    }
    const edgeDensity = edgeCount / sobelMag.length;
    let bwCount = 0;
    for (let v of gray) if (v < 30 || v > 225) bwCount++;
    const bwRatio = bwCount / gray.length;
    if (bwRatio > 0.75 && edgeDensity < 0.15) return Math.max(W, H);
    if (bwRatio > 0.5 && edgeDensity < 0.25) return 800;
    if (edgeDensity > 0.3) return 300;
    if (edgeDensity > 0.15) return 400;
    return 640;
  };

  // ---------- SPLIT IMAGE ----------
  const splitImage = (img, TILE_SIZE) => {
    if (TILE_SIZE >= img.width || TILE_SIZE >= img.height) {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      return { tiles: [{ dataUrl: c.toDataURL("image/png"), sx: 0, sy: 0, w: img.width, h: img.height }], cols: 1, rows: 1 };
    }
    const tiles = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const cols = Math.ceil(img.width / TILE_SIZE);
    const rows = Math.ceil(img.height / TILE_SIZE);
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const sx = rx * TILE_SIZE, sy = ry * TILE_SIZE;
        const w = Math.min(TILE_SIZE, img.width - sx);
        const h = Math.min(TILE_SIZE, img.height - sy);
        canvas.width = w; canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
        tiles.push({ dataUrl: canvas.toDataURL("image/png"), sx, sy, w, h });
      }
    }
    return { tiles, cols, rows };
  };

  // ---------- HANDLE UPLOAD ----------
  const handleUpload = async () => {
    if (!image) return alert("Please select an image first!");
    setLoading(true);
    setResultImage(null);
    setReport(null);

    let img = new Image();
    img.src = URL.createObjectURL(image);
    img.onload = async () => {
      try {
        img = await autoCropPCB(img);
        const chosenTile = Math.floor(await estimateEdgeDensity(img));
        const { tiles } = splitImage(img, chosenTile);
        const processedTiles = [];
        let allDetections = [];

        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          const blob = await (await fetch(t.dataUrl)).blob();
          const form = new FormData();
          form.append("image", blob, `tile_${i}.png`);
          try {
            const resp = await fetch(`${process.env.REACT_APP_API_URL}/detect`, {
              method: "POST",
              body: form,
              headers: {
                // Required for free ngrok tunnels to skip the browser warning page
                "ngrok-skip-browser-warning": "true",
              },
            });
            const data = await resp.json();
            if (data.image) {
              processedTiles.push({ url: `data:image/png;base64,${data.image}`, ...t });
            } else {
              processedTiles.push({ url: t.dataUrl, ...t });
            }
            if (data.detections) {
              allDetections = allDetections.concat(data.detections);
            }
            if (data.report && tiles.length === 1) {
              setReport(data.report);
            }
          } catch {
            processedTiles.push({ url: t.dataUrl, ...t });
          }
        }

        if (tiles.length > 1 && allDetections.length >= 0) {
          setReport(computeLocalReport(allDetections));
        }

        const outCanvas = document.createElement("canvas");
        outCanvas.width = img.width; outCanvas.height = img.height;
        const outCtx = outCanvas.getContext("2d");
        outCtx.fillStyle = "#ffffff";
        outCtx.fillRect(0, 0, img.width, img.height);
        for (let tile of processedTiles) {
          const tileImg = new Image();
          tileImg.src = tile.url;
          await new Promise((res) => {
            tileImg.onload = () => { outCtx.drawImage(tileImg, tile.sx, tile.sy, tile.w, tile.h); res(); };
            tileImg.onerror = res;
          });
        }
        const finalBlob = await new Promise((r) => outCanvas.toBlob(r, "image/png"));
        setResultImage(URL.createObjectURL(finalBlob));
      } catch (err) {
        alert("Processing failed: " + err);
      } finally {
        setLoading(false);
      }
    };
  };

  // ---------- LOCAL REPORT (for multi-tile) ----------
  const computeLocalReport = (detections) => {
    if (!detections || detections.length === 0) {
      return {
        total_defects: 0, defect_summary: [], severity_score: 0,
        max_severity: "None", grade: "A+",
        grade_label: "Excellent \u2014 No defects detected", health_percentage: 100,
      };
    }

    const impactLevels = { Medium: 1, High: 2, Critical: 3 };
    const classCounts = {};
    const classAreas = {};
    let totalConf = 0;
    for (const d of detections) {
      classCounts[d.class_name] = (classCounts[d.class_name] || 0) + 1;
      classAreas[d.class_name] = (classAreas[d.class_name] || 0) + (d.area_percentage || 0);
      totalConf += d.confidence;
    }

    let weightedScore = 0, maxImpactLevel = 0;
    const defectSummary = [];
    for (const [cls, count] of Object.entries(classCounts)) {
      const info = SEVERITY_MAP[cls] || { weight: 5, impact: "Medium", description: "Unknown defect type" };
      weightedScore += info.weight * count;
      const level = impactLevels[info.impact] || 1;
      if (level > maxImpactLevel) maxImpactLevel = level;
      defectSummary.push({
        class_name: cls, count,
        severity_impact: info.impact,
        severity_weight: info.weight,
        description: info.description,
        total_area_percentage: Math.round((classAreas[cls] || 0) * 100) / 100,
      });
    }

    const severityScore = Math.min(100, weightedScore * 2);
    const healthPct = Math.max(0, 100 - severityScore);
    let grade, gradeLabel;
    if (severityScore === 0)       { grade = "A+"; gradeLabel = "Excellent \u2014 No defects detected"; }
    else if (severityScore <= 10)  { grade = "A";  gradeLabel = "Very Good \u2014 Minor cosmetic issues only"; }
    else if (severityScore <= 25)  { grade = "B";  gradeLabel = "Good \u2014 Minor defects, likely functional"; }
    else if (severityScore <= 45)  { grade = "C";  gradeLabel = "Fair \u2014 Moderate defects, needs review"; }
    else if (severityScore <= 65)  { grade = "D";  gradeLabel = "Poor \u2014 Significant defects detected"; }
    else                           { grade = "F";  gradeLabel = "Fail \u2014 Critical defects, not usable"; }

    const maxSevMap = { 0: "None", 1: "Medium", 2: "High", 3: "Critical" };
    const totalAreaPct = detections.reduce((sum, d) => sum + (d.area_percentage || 0), 0);

    return {
      total_defects: detections.length,
      unique_defect_types: Object.keys(classCounts).length,
      defect_summary: defectSummary.sort((a, b) => b.severity_weight - a.severity_weight),
      severity_score: Math.round(severityScore * 10) / 10,
      max_severity: maxSevMap[maxImpactLevel],
      grade, grade_label: gradeLabel,
      health_percentage: Math.round(healthPct * 10) / 10,
      avg_confidence: Math.round((totalConf / detections.length) * 1000) / 10,
      total_area_impacted: Math.round(totalAreaPct * 100) / 100,
    };
  };

  // ---------- COLORS ----------
  const gradeColor = (grade) => {
    const c = { "A+": "#00e676", A: "#66bb6a", B: "#ffee58", C: "#ffa726", D: "#ef5350", F: "#d32f2f" };
    return c[grade] || "#888";
  };
  const severityColor = (impact) => {
    const c = { Critical: "#d32f2f", High: "#ef5350", Medium: "#ffa726", Low: "#66bb6a" };
    return c[impact] || "#888";
  };

  return (
    <div className={`app ${animateIn ? "app-visible" : ""}`}>
      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-content">
          <div className="logo-area">
            <div className="logo-icon-wrap">
              <span className="logo-icon">&#9881;</span>
            </div>
            <div>
              <h1 className="main-title">Intelligent PCB Quality Grading System</h1>
              <p className="subtitle">ML-Based Defect Detection &amp; Quality Assessment</p>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {/* ===== UPLOAD SECTION ===== */}
        <section className="upload-section">
          <div className="section-header">
            <h2>Upload PCB Image</h2>
            <p className="upload-desc">Select a PCB image to analyze for defects and generate a comprehensive health report.</p>
          </div>

          <div className="upload-area" onClick={() => document.getElementById("file-input").click()}>
            {preview ? (
              <img src={preview} alt="preview" className="preview-img" />
            ) : (
              <div className="upload-placeholder">
                <div className="upload-icon-circle">
                  <span className="upload-icon">&#8682;</span>
                </div>
                <p className="upload-text">Click to select or drag &amp; drop a PCB image</p>
                <p className="upload-hint">Supports PNG, JPG, BMP</p>
              </div>
            )}
            <input id="file-input" type="file" accept="image/*" onChange={handleFileChange} hidden />
          </div>

          <button className="detect-btn" onClick={handleUpload} disabled={loading || !image}>
            {loading ? (
              <span className="spinner-wrap"><span className="spinner"></span> Analyzing PCB...</span>
            ) : (
              <><span className="btn-icon">&#9889;</span> Analyze &amp; Grade PCB</>
            )}
          </button>
        </section>

        {/* ===== REFERENCE CHARTS (always visible) ===== */}
        <section className="reference-section">
          <div className="ref-toggle-row">
            <button className={`ref-toggle-btn ${showScoreChart ? "active" : ""}`} onClick={() => setShowScoreChart(!showScoreChart)}>
              {showScoreChart ? "\u25BE" : "\u25B8"} Defect Impact Score Chart
            </button>
            <button className={`ref-toggle-btn ${showGradeChart ? "active" : ""}`} onClick={() => setShowGradeChart(!showGradeChart)}>
              {showGradeChart ? "\u25BE" : "\u25B8"} Grade Explanation Chart
            </button>
          </div>

          {showScoreChart && (
            <div className="ref-chart-card fade-in">
              <h3>&#128202; Predefined Defect Impact Score Chart</h3>
              <p className="ref-chart-subtitle">This chart defines the severity weight assigned to each known PCB defect type. These weights are used to compute the final severity score and PCB grade.</p>

              <div className="ref-chart-group">
                <h4>Defect Types &amp; Severity Weights</h4>
                {Object.entries(SEVERITY_MAP).map(([key, val]) => (
                  <div key={key} className="ref-row">
                    <span className="ref-defect-name">{key.replace(/_/g, " ")}</span>
                    <span className="ref-weight">Weight: {val.weight}/10</span>
                    <span className="ref-impact-badge" style={{ background: severityColor(val.impact) }}>{val.impact}</span>
                    <span className="ref-desc">{val.description}</span>
                  </div>
                ))}
              </div>

              <div className="ref-chart-group">
                <h4>Impact Level Definitions</h4>
                {IMPACT_SCORES.map((item) => (
                  <div key={item.level} className="ref-row">
                    <span className="ref-impact-badge" style={{ background: item.color }}>{item.level}</span>
                    <span className="ref-weight">Score Range: {item.score}</span>
                    <span className="ref-desc">{item.desc}</span>
                  </div>
                ))}
              </div>

              <div className="ref-formula">
                <h4>&#128290; Grading Formula</h4>
                <p><strong>Severity Score</strong> = min(100, &Sigma;(defect_weight &times; defect_count) &times; 2)</p>
                <p><strong>Health %</strong> = 100 &minus; Severity Score</p>
                <p><strong>Grade</strong> is assigned based on severity score thresholds (see Grade Chart).</p>
              </div>
            </div>
          )}

          {showGradeChart && (
            <div className="ref-chart-card fade-in">
              <h3>&#127942; PCB Grade Explanation Chart</h3>
              <p className="ref-chart-subtitle">Each PCB is assigned a grade from A+ to F based on the computed severity score. Below is what each grade means.</p>
              {GRADE_EXPLANATIONS.map((g) => (
                <div key={g.grade} className="grade-explain-row">
                  <span className="grade-explain-letter" style={{ color: g.color, borderColor: g.color }}>{g.grade}</span>
                  <div className="grade-explain-body">
                    <span className="grade-explain-range">Severity Score: {g.range}</span>
                    <p className="grade-explain-meaning">{g.meaning}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ===== RESULTS ===== */}
        {resultImage && (
          <section className="results-section fade-in">
            <div className="results-grid">
              {/* Image Card */}
              <div className="result-card image-card">
                <h3>&#128269; Defect Detection Result</h3>
                <img src={resultImage} alt="annotated result" />
                <a href={resultImage} download="pcb_result.png" className="download-btn">&#11015; Download Result Image</a>
              </div>

              {/* Report Card */}
              {report && (
                <div className="result-card report-card">
                  <h3>&#128203; PCB Health Report</h3>

                  {/* Grade Badge */}
                  <div className="grade-badge" style={{ borderColor: gradeColor(report.grade), boxShadow: `0 0 30px ${gradeColor(report.grade)}22` }}>
                    <span className="grade-letter" style={{ color: gradeColor(report.grade) }}>{report.grade}</span>
                    <div className="grade-info">
                      <span className="grade-label">{report.grade_label}</span>
                      <span className="grade-score-hint">Severity Score: {report.severity_score}/100</span>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="stats-grid">
                    <div className="stat-box">
                      <span className="stat-value">{report.total_defects}</span>
                      <span className="stat-label">Total Defects</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-value" style={{ color: severityColor(report.max_severity) }}>{report.max_severity}</span>
                      <span className="stat-label">Max Severity</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-value">{report.severity_score}<small>/100</small></span>
                      <span className="stat-label">Severity Score</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-value">{report.health_percentage}<small>%</small></span>
                      <span className="stat-label">Health</span>
                    </div>
                  </div>

                  {/* Total Area Impacted */}
                  {report.total_area_impacted > 0 && (
                    <div className="area-impact-banner">
                      <span className="area-icon">&#9638;</span>
                      <span>Total Defect Area: <strong>{report.total_area_impacted}%</strong> of PCB surface impacted</span>
                    </div>
                  )}

                  {/* Health Bar */}
                  <div className="health-bar-container">
                    <div className="health-bar-label"><span>PCB Health</span><span>{report.health_percentage}%</span></div>
                    <div className="health-bar-bg">
                      <div className="health-bar-fill" style={{
                        width: `${report.health_percentage}%`,
                        background: report.health_percentage >= 75 ? "linear-gradient(90deg, #00e676, #69f0ae)" : report.health_percentage >= 50 ? "linear-gradient(90deg, #ffa726, #ffcc80)" : "linear-gradient(90deg, #d32f2f, #ef5350)",
                      }}></div>
                    </div>
                  </div>

                  {/* Defect Breakdown */}
                  {report.defect_summary && report.defect_summary.length > 0 && (
                    <div className="defect-breakdown">
                      <h4>&#128736; Defect Breakdown</h4>
                      {report.defect_summary.map((d, i) => (
                        <div key={i} className="defect-row">
                          <div className="defect-row-header">
                            <span className="defect-name">{d.class_name.replace(/_/g, " ")}</span>
                            <span className="defect-count">&times;{d.count}</span>
                            <span className="defect-weight-badge">Wt: {d.severity_weight}/10</span>
                            <span className="defect-severity" style={{ background: severityColor(d.severity_impact) }}>{d.severity_impact}</span>
                          </div>
                          <p className="defect-desc">{d.description}</p>
                          <div className="defect-meta">
                            <span>Damage Contribution: <strong>{d.severity_weight * d.count * 2} pts</strong> to severity score</span>
                            {d.total_area_percentage > 0 && (
                              <span className="defect-area">Area Impacted: <strong>{d.total_area_percentage}%</strong></span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {report.avg_confidence && (
                    <div className="confidence-info">&#129302; Model Confidence: <strong>{report.avg_confidence}%</strong></div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>Intelligent PCB Quality Grading System &mdash; Powered by YOLOv8 &amp; Deep Learning</p>
        <p className="footer-sub">Built by Akshit Kumar | ML-Based PCB Quality Assessment</p>
      </footer>
    </div>
  );
}

export default App;
