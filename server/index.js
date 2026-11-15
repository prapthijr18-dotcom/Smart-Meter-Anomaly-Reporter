import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import axios from "axios";
import Database from "better-sqlite3";
import crypto from "crypto";
import Report from "./models/Report.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const FLASK = process.env.FLASK_URL || "http://127.0.0.1:5001";
const db = new Database("dispatch_audit.db");
db.exec(`
CREATE TABLE IF NOT EXISTS dispatch_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT, zone TEXT, handler TEXT,
 priority TEXT, decision TEXT, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS handlers (
 section TEXT PRIMARY KEY, name TEXT, available INTEGER DEFAULT 1, capacity INTEGER DEFAULT 6
);
`);
const seed = db.prepare("INSERT OR IGNORE INTO handlers(section,name,available,capacity) VALUES(?,?,1,6)");
["A","B","C","D","E"].forEach(s => seed.run(s, `Section ${s} Crew`));

const sections = ["A","B","C","D","E"];
const openStatuses = ["Pending","Assigned","In Progress"];
const audit = db.prepare(`INSERT INTO dispatch_audit(report_id,zone,handler,priority,decision,reason) VALUES(?,?,?,?,?,?)`);

async function dispatch(report) {
  // Avoid duplicate assignment if dispatch is retried.
  if (report.handler || report.assignmentStatus === "Assigned") return report;
  const crews = db.prepare("SELECT * FROM handlers ORDER BY section").all();
  const loads = await Report.aggregate([
    { $match: { handler: { $ne: null }, status: { $in: openStatuses } } },
    { $group: { _id: "$handler", count: { $sum: 1 } } }
  ]);
  const loadMap = Object.fromEntries(loads.map(x => [x._id, x.count]));
  const eligible = crews.filter(c => c.available && (loadMap[c.name] || 0) < c.capacity);
  const originIndex = sections.indexOf(report.zone);
  eligible.sort((a,b) => {
    const da = Math.abs(sections.indexOf(a.section) - originIndex);
    const dbb = Math.abs(sections.indexOf(b.section) - originIndex);
    return da - dbb || a.section.localeCompare(b.section);
  });
  if (!eligible.length) {
    report.assignmentStatus = "Queued";
    report.status = "Pending";
    report.handler = null;
    audit.run(String(report._id), report.zone, null, report.priority, "QUEUED", "No available crew under capacity");
  } else {
    const chosen = eligible[0];
    report.handler = chosen.name;
    report.assignmentStatus = "Assigned";
    report.status = "Assigned";
    const reason = chosen.section === report.zone ? "Zone crew available" : `Overflow to nearest available section ${chosen.section}`;
    audit.run(String(report._id), report.zone, chosen.name, report.priority, "ASSIGNED", reason);
  }
  await report.save();
  return report;
}

app.get("/api/health", (_,res) => res.json({ok:true}));
app.post("/api/reports", async (req,res) => {
  try {
    const input = req.body || {};
    const check = await axios.post(`${FLASK}/validate`, {
      meterId: input.meterId, reading: input.reading,
      description: input.description, urgency: input.urgency
    }).catch(e => e.response || Promise.reject(e));
    if (check.status !== 200 || !check.data.accepted) {
      return res.status(400).json({message:"Report rejected during validation", validation:check.data});
    }
    const report = new Report({
      reporterName: input.reporterName, contact: input.contact || "",
      meterId: input.meterId, reading: input.reading, description: input.description,
      urgency: input.urgency, category: check.data.category, priority: check.data.priority,
      zone: check.data.routingKey, validation: check.data
    });
    await report.save();
    await dispatch(report);
    res.status(201).json({message:"Report accepted", report});
  } catch (e) {
    res.status(500).json({message:"Could not create report", error:e.message});
  }
});

app.get("/api/reports", async (req,res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.reportId) filter._id = req.query.reportId;
    if (req.query.meterId) filter.meterId = req.query.meterId;
    res.json(await Report.find(filter).sort({submittedAt:-1}).limit(300));
  } catch(e) { res.status(400).json({message:e.message}); }
});
app.get("/api/reports/:id", async (req,res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({message:"Report not found"});
  res.json(report);
});
app.patch("/api/reports/:id/status", async (req,res) => {
  const allowed = ["Pending","Assigned","In Progress","Resolved"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({message:"Invalid status"});
  const report = await Report.findByIdAndUpdate(req.params.id,{status:req.body.status},{new:true});
  if (!report) return res.status(404).json({message:"Report not found"});
  res.json(report);
});
app.patch("/api/handlers/:section", (req,res) => {
  const section = req.params.section.toUpperCase();
  if (!sections.includes(section)) return res.status(404).json({message:"Unknown section"});
  const available = Boolean(req.body.available);
  db.prepare("UPDATE handlers SET available=? WHERE section=?").run(available ? 1 : 0, section);
  res.json({section,available});
});
app.get("/api/routing", async (_,res) => {
  const handlers = db.prepare("SELECT * FROM handlers ORDER BY section").all();
  const loads = await Report.aggregate([
    {$match:{handler:{$ne:null},status:{$in:openStatuses}}},
    {$group:{_id:"$handler",count:{$sum:1}}}
  ]);
  const loadMap = Object.fromEntries(loads.map(x=>[x._id,x.count]));
  const queued = await Report.find({assignmentStatus:"Queued"}).sort({priority:1,submittedAt:1});
  const logs = db.prepare("SELECT * FROM dispatch_audit ORDER BY id DESC LIMIT 100").all();
  res.json({handlers:handlers.map(h=>({...h,openCases:loadMap[h.name]||0})),queued,logs});
});
app.get("/api/dashboard/summary", async (_,res) => {
  const reports = await Report.find();
  const count = status => reports.filter(r=>r.status===status).length;
  const by = key => reports.reduce((a,r)=>{a[r[key]]=(a[r[key]]||0)+1;return a;},{});
  res.json({total:reports.length,pending:count("Pending"),assigned:count("Assigned"),
    inProgress:count("In Progress"),resolved:count("Resolved"),byCategory:by("category"),byZone:by("zone")});
});

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smart_meter_anomaly")
 .then(()=>app.listen(PORT,()=>console.log(`API running on http://localhost:${PORT}`)))
 .catch(err=>{console.error("MongoDB connection failed:",err.message);process.exit(1);});
