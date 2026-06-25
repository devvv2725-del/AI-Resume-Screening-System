const express = require("express");
const cors = require("cors");
const axios = require("axios");
const supabase = require("./supabase");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* ---------------- MULTER CONFIG ---------------- */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

/* ---------------- HOME ---------------- */

app.get("/", (req, res) => {
  res.send("AI Resume Screening API Running");
});

/* ---------------- TEST AI ---------------- */

app.get("/test-ai", async (req, res) => {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "Tell me about AI in one sentence."
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      success: true,
      answer: response.data.choices[0].message.content
    });

  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).json({
      error: "AI request failed"
    });
  }
});

/* ---------------- TEST DATABASE ---------------- */

app.get("/test-db", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("resumes")
      .select("*");

    if (error) throw error;

    res.json(data);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* ---------------- UPLOAD RESUME ---------------- */

app.post("/upload-resume", upload.single("resume"), async (req, res) => {
     console.log("REQ.FILE =");
  console.log(req.file);

  console.log("FILENAME =", req.file?.filename);

  try {

    if (!req.file) {
  return res.status(400).json({
    error: "No file uploaded"
  });
}

    const pdfBuffer = fs.readFileSync(req.file.path);

    const pdfData = await pdfParse(pdfBuffer);

    const resumeText = pdfData.text;

    if (!resumeText.trim()) {
      return res.status(400).json({
        error: "No text found in PDF"
      });
    }

    const aiResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Extract resume details and return ONLY valid JSON.

{
  "name":"",
  "email":"",
  "skills":[],
  "education":"",
  "experience":"",
  "summary":""
}
`
          },
          {
            role: "user",
            content: resumeText
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const result = JSON.parse(
      aiResponse.data.choices[0].message.content
    );

    const requiredSkills = [
  "Python",
  "JavaScript",
  "React",
  "Node.js",
  "SQL",
  "HTML",
  "CSS"
];

let matchedSkills = 0;

requiredSkills.forEach((skill) => {
  if (
    result.skills.some((s) =>
      s.toLowerCase().includes(skill.toLowerCase())
    )
  ) {
    matchedSkills++;
  }
});

const atsScore = Math.round(
  (matchedSkills / requiredSkills.length) * 100
);

    /* Prevent Empty Records */

    if (
      !result.name &&
      !result.email &&
      (!result.skills || result.skills.length === 0)
    ) {
      return res.status(400).json({
        error: "Resume could not be parsed properly"
      });
    }

    const { data, error } = await supabase
  .from("resumes")
  .insert([
    {
      candidate_name: result.name,
      email: result.email,
      skills: result.skills.join(", "),
      education: result.education,
      experience: result.experience,
      summary: result.summary,
      ats_score: atsScore,
      resume_file: req.file.filename
    }
  ])
  .select();

    if (error) throw error;

    console.log("Inserted row:");
console.log(data);

    res.json({
      success: true,
      candidate: data[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

/* ---------------- ALL CANDIDATES ---------------- */

app.get("/candidates", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

/* ---------------- ATS MATCH SCORE ---------------- */

app.post("/match-score", async (req, res) => {
  try {

    const { skills, jobDescription } = req.body;

    const skillArray = skills
      .split(",")
      .map(skill => skill.trim().toLowerCase());

    const jd = jobDescription.toLowerCase();

    const matchedSkills = [];

    skillArray.forEach(skill => {
      if (jd.includes(skill)) {
        matchedSkills.push(skill);
      }
    });

    const score = Math.round(
      (matchedSkills.length / skillArray.length) * 100
    );

    res.json({
      score,
      matchedSkills
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/* ---------------- START SERVER ---------------- */

app.delete("/candidate/:id", async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("resumes")
    .delete()
    .eq("id", id);

  if (error) {
    return res.status(500).json(error);
  }

  res.json({
    success: true
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});

app.get("/resume/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("resumes")
      .select("resume_file")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).send("Resume not found");
    }

    const filePath = path.join(
  __dirname,
  "uploads",
  data.resume_file
);

if (!fs.existsSync(filePath)) {
  return res.status(404).send("Resume file not found");
}

res.sendFile(filePath);

  } catch (err) {
    res.status(500).send(err.message);
  }
});