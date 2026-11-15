import mongoose from "mongoose";

const reportSchema = new mongoose.Schema({
  reporterName: { type: String, required: true, trim: true },
  contact: { type: String, default: "" },
  meterId: { type: String, required: true, index: true },
  reading: { type: String, required: true },
  description: { type: String, required: true },
  urgency: { type: String, required: true },
  category: { type: String, required: true },
  priority: { type: String, required: true },
  zone: { type: String, required: true },
  handler: { type: String, default: null },
  assignmentStatus: { type: String, enum: ["Queued","Assigned"], default: "Queued" },
  status: { type: String, enum: ["Pending","Assigned","In Progress","Resolved"], default: "Pending" },
  validation: { type: Object, required: true },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Report", reportSchema);
