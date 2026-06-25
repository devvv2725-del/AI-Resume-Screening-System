import "./App.css";
import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = "http://localhost:5000";

function App() {
  const [candidates, setCandidates]     = useState([]);
  const [file, setFile]                 = useState(null);
  const [candidate, setCandidate]       = useState(null);
  const [loading, setLoading]           = useState(false);
  const [search, setSearch]             = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [sortOption, setSortOption]     = useState("ats_desc");
  const [lightMode, setLightMode]       = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => { fetchCandidates(); }, []);

  const fetchCandidates = async () => {
    try {
      const res = await axios.get(`${API_BASE}/candidates`);
      setCandidates(res.data);
    } catch (err) { console.error(err); }
  };

  const uploadResume = async () => {
    if (!file) return alert("Select a PDF first");
    const formData = new FormData();
    formData.append("resume", file);
    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/upload-resume`, formData);
      setCandidate(res.data.candidate);
      setTimeout(() => setCandidate(null), 5000);
      setSuccessMessage("Resume uploaded and analysed successfully");
      setTimeout(() => setSuccessMessage(""), 4000);
      fetchCandidates();
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally { setLoading(false); }
  };

  const deleteCandidate = async (id) => {
    try {
      await axios.delete(`${API_BASE}/candidate/${id}`);
      fetchCandidates();
    } catch (err) { console.error(err); alert("Delete failed"); }
  };

  const updateCandidateField = async (id, fields) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)));
    try { await axios.patch(`${API_BASE}/candidate/${id}`, fields); }
    catch (err) { console.error("Could not persist to backend:", err); }
  };

  const viewResume = (c) => {
    const url = c.resume_url || `${API_BASE}/resume/${c.id}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ── Derived stats ───────────────────────────────────────
  const topCandidate = candidates.length
    ? [...candidates].sort((a, b) => (b.ats_score || 0) - (a.ats_score || 0))[0]
    : null;

  const shortlisted = candidates.filter((c) => c.ats_score >= 80).length;
  const underReview = candidates.filter((c) => c.ats_score >= 50 && c.ats_score < 80).length;
  const rejected    = candidates.filter((c) => (c.ats_score || 0) < 50).length;
  const averageATS  = candidates.length
    ? Math.round(candidates.reduce((s, c) => s + (c.ats_score || 0), 0) / candidates.length)
    : 0;

  // ── Matching helpers ────────────────────────────────────
  const calculateMatchScore = (skills) => {
    if (!jobDescription || !skills) return 0;
    const jdWords = jobDescription.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
    const cSkills = skills.toLowerCase().replace(/[.,]/g, "").split(/[\s,]+/).filter(Boolean);
    const hits = jdWords.filter((w) => cSkills.some((s) => s.includes(w) || w.includes(s)));
    return Math.round((hits.length / jdWords.length) * 100);
  };

  const getMissingSkills = (skills) => {
    if (!jobDescription.trim() || !skills) return [];
    const jdWords = [...new Set(
      jobDescription.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter((w) => w.length > 2)
    )];
    const cSkills = skills.toLowerCase().replace(/[.,]/g, "").split(/[\s,]+/).filter(Boolean);
    return jdWords.filter((w) => !cSkills.some((s) => s.includes(w) || w.includes(s)));
  };

  const getFitScore = (c) => {
    if (!jobDescription.trim()) return c.ats_score || 0;
    return Math.round(((c.ats_score || 0) + calculateMatchScore(c.skills)) / 2);
  };

  // ── Helpers ─────────────────────────────────────────────
  const statusClass = (score) =>
    score >= 80 ? "c-green" : score >= 50 ? "c-yellow" : "c-red";

  const recClass = (score) =>
    score > 80 ? "go" : score >= 50 ? "review" : "no";

  const recLabel = (score) =>
    score > 80 ? "✦ Recommended for Interview"
    : score >= 50 ? "◉ Needs Review"
    : "✕ Not Recommended";

  const rankClass = (i) =>
    i === 0 ? "r-gold" : i === 1 ? "r-silver" : i === 2 ? "r-bronze" : "r-plain";

  const rankLabel = (i) =>
    i === 0 ? "🥇 Rank #1" : i === 1 ? "🥈 Rank #2" : i === 2 ? "🥉 Rank #3" : `Rank #${i + 1}`;

  const statusEmoji = (score) =>
    score >= 80 ? "✅ Shortlisted" : score >= 50 ? "🟡 Under Review" : "❌ Rejected";

  const getStatusLabel = (score) =>
    score >= 80 ? "Shortlisted" : score >= 50 ? "Under Review" : "Rejected";

  const progressWidth = (score) => `${score || 0}%`;

  const exportCSV = () => {
    if (!candidates.length) return alert("No candidates to export");
    const headers = ["Name", "Email", "ATS Score", "Status"];
    const rows = candidates.map((c) => [
      c.candidate_name || "", c.email || "",
      c.ats_score ?? "", getStatusLabel(c.ats_score || 0),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.setAttribute("download", "candidates.csv");
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── Filtering + sorting ─────────────────────────────────
  const filtered = candidates.filter((c) =>
    c.candidate_name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "ats_asc")   return (a.ats_score || 0) - (b.ats_score || 0);
    if (sortOption === "name_asc")  return (a.candidate_name || "").localeCompare(b.candidate_name || "");
    if (sortOption === "name_desc") return (b.candidate_name || "").localeCompare(a.candidate_name || "");
    return (b.ats_score || 0) - (a.ats_score || 0); // ats_desc default
  });

  // ── Render ──────────────────────────────────────────────
  return (
    <div className={`app${lightMode ? " light" : ""}`}>

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">🤖</div>
          <h2>ResumeAI Recruiter Dashboard</h2>
        </div>
        <button className="theme-toggle-btn" onClick={() => setLightMode((v) => !v)}>
          {lightMode ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </nav>

      {/* Hero */}
      <h1 className="title">AI Resume Screening</h1>
      <p className="subtitle">
        Upload resumes · Score candidates · Match against job descriptions · Track interviews
      </p>

      {/* Success banner */}
      {successMessage && <div className="success-banner">✅ {successMessage}</div>}

      {/* Upload */}
      <div className="upload-card">
        <h2>Upload Resume</h2>
        <div className="upload-zone">
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} />
          <p className="upload-hint">PDF files only · AI extracts skills, education &amp; experience</p>
        </div>
        <div className="upload-actions">
          <button className="upload-btn" onClick={uploadResume}>
            {loading ? "Analysing…" : "⬆ Upload Resume"}
          </button>
          <button className="export-btn" onClick={exportCSV}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Newly uploaded preview */}
      {candidate && (
        <div className="upload-preview">
          <h2>✦ Just Uploaded</h2>
          <p className="preview-row"><strong>Name:</strong> {candidate.candidate_name}</p>
          <p className="preview-row"><strong>Email:</strong> {candidate.email}</p>
          <p className="preview-row"><strong>Skills:</strong> {candidate.skills}</p>
          <p className="preview-row"><strong>Education:</strong> {candidate.education}</p>
          <p className="preview-row"><strong>Experience:</strong> {candidate.experience}</p>
        </div>
      )}

      {/* Top candidate */}
      {topCandidate && (
        <div className="top-candidate-card">
          <div className="top-badge">🏆 Top Candidate</div>
          <h3>{topCandidate.candidate_name}</h3>
          <div className="top-score">{topCandidate.ats_score}%</div>
          <p className="top-email">{topCandidate.email}</p>
        </div>
      )}

      {/* Stats */}
      <div className="stats-container">
        <div className="stat-card s-total">
          <div className="stat-num">{candidates.length}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-card s-avg">
          <div className="stat-num">{averageATS}%</div>
          <div className="stat-label">Avg ATS</div>
        </div>
        <div className="stat-card s-shortlist">
          <div className="stat-num">{shortlisted}</div>
          <div className="stat-label">Shortlisted</div>
        </div>
        <div className="stat-card s-review">
          <div className="stat-num">{underReview}</div>
          <div className="stat-label">Under Review</div>
        </div>
        <div className="stat-card s-rejected">
          <div className="stat-num">{rejected}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="search-sort-row">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search candidates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sort-box">
          <span className="sort-label">Sort by</span>
          <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
            <option value="ats_desc">ATS High → Low</option>
            <option value="ats_asc">ATS Low → High</option>
            <option value="name_asc">Name A → Z</option>
            <option value="name_desc">Name Z → A</option>
          </select>
        </div>
      </div>

      {/* JD Box */}
      <div className="jd-box">
        <h3>Job Description</h3>
        <textarea
          placeholder="Paste the job description here to enable JD matching, fit score, and missing skills analysis…"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows="5"
        />
      </div>

      {/* Candidates heading */}
      <div className="section-row">
        <span className="section-heading">Candidates</span>
        <span className="section-count">{sorted.length} shown</span>
      </div>

      {/* Candidate grid */}
      {candidates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p>No candidates yet — upload a resume to get started.</p>
        </div>
      ) : (
        <div className="candidate-grid">
          {sorted.map((c, index) => {
            const matchScore   = calculateMatchScore(c.skills);
            const fitScore     = getFitScore(c);
            const missing      = getMissingSkills(c.skills);
            const score        = c.ats_score || 0;
            const sClass       = statusClass(score);
            const skills       = c.skills?.split(",").map((s) => s.trim()).filter(Boolean) || [];

            return (
              <div key={c.id} className={`candidate-card ${sClass}`}>
                <div className="card-inner">

                  {/* Header row */}
                  <div className="card-header">
                    <div className="card-header-left">
                      <div className="card-name">{c.candidate_name}</div>
                      <div className={`card-rank ${rankClass(index)}`}>{rankLabel(index)}</div>
                    </div>
                    <div className="ats-score-box">
                      <div className="ats-num">{score}%</div>
                      <div className="ats-lbl">ATS Score</div>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <span className={`rec-badge ${recClass(score)}`}>{recLabel(score)}</span>

                  {/* Progress bar */}
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: progressWidth(score) }} />
                  </div>

                  {/* Score trio */}
                  <div className="score-trio">
                    <div className="score-box">
                      <div className="sval">{score}%</div>
                      <div className="sname">ATS</div>
                    </div>
                    <div className="score-box">
                      <div className="sval">{matchScore}%</div>
                      <div className="sname">JD Match</div>
                    </div>
                    <div className="score-box">
                      <div className="sval">{fitScore}%</div>
                      <div className="sname">Fit Score</div>
                    </div>
                  </div>

                  <div className="card-div" />

                  {/* Email */}
                  <p className="info-row"><strong>Email</strong> — {c.email}</p>

                  {/* Skills */}
                  <p className="info-row" style={{ marginBottom: 4 }}><strong>Skills</strong></p>
                  <div className="skills-wrap">
                    {skills.map((sk, i) => <span key={i} className="skill-tag">{sk}</span>)}
                  </div>

                  {/* Missing skills */}
                  {jobDescription.trim() && (
                    <div className="missing-wrap">
                      <div className="missing-lbl">Missing Skills</div>
                      {missing.length ? (
                        <div className="missing-tags">
                          {missing.slice(0, 10).map((m, i) => (
                            <span key={i} className="missing-tag">{m}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="no-missing">✓ All required skills present</span>
                      )}
                    </div>
                  )}

                  {/* Education / Experience / Summary */}
                  <p className="info-row"><strong>Education</strong> — {c.education}</p>
                  <p className="info-row"><strong>Experience</strong> — {c.experience}</p>
                  <p className="info-row"><strong>Summary</strong> — {c.summary}</p>

                  {/* Status */}
                  <p className="info-row"><strong>Status</strong> — {statusEmoji(score)}</p>

                  <div className="card-div" />

                  {/* Interview stage */}
                  <label className="field-lbl">Interview Stage</label>
                  <select
                    className="interview-status-select"
                    value={c.interview_status || "Applied"}
                    onChange={(e) => updateCandidateField(c.id, { interview_status: e.target.value })}
                  >
                    <option value="Applied">Applied</option>
                    <option value="Shortlisted">Shortlisted</option>
                    <option value="Interview Scheduled">Interview Scheduled</option>
                    <option value="Selected">Selected</option>
                    <option value="Rejected">Rejected</option>
                  </select>

                  {/* Notes */}
                  <label className="field-lbl">Recruiter Notes</label>
                  <textarea
                    className="notes-box"
                    placeholder="Add notes about this candidate…"
                    defaultValue={c.notes || ""}
                    rows="2"
                    onBlur={(e) => updateCandidateField(c.id, { notes: e.target.value })}
                  />

                  {/* Actions */}
                  <div className="card-actions">
                    <button className="view-btn" onClick={() => viewResume(c)}>📄 View Resume</button>
                    <button className="delete-btn" onClick={() => deleteCandidate(c.id)}>Delete</button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        Built by Dev Gargh &nbsp;·&nbsp; React &nbsp;·&nbsp; Node.js &nbsp;·&nbsp; Supabase &nbsp;·&nbsp; AI Resume Screening System
      </footer>

    </div>
  );
}

export default App;
