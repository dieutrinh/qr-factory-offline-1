app.post("/api/auth/setAdminCode", (req, res)=>{
  const b = req.body || {};
  const existing = getSetting("admin_code");              // có thể null lần đầu
  const current = normalizeAdminCode(b.current_admin_code || b.admin_code);
  const next = String(b.new_admin_code || "").trim();

  if(!next || next.length < 6) {
    return res.status(400).json({ error: "new_admin_code too short" });
  }

  // ✅ LẦN ĐẦU: chưa có admin_code -> cho phép set luôn, không cần current
  if(!existing) {
    setSetting("admin_code", next);
    logAudit({ actor: "admin", action: "INIT_ADMIN_CODE", code: "", detail: {} });
    return res.json({ ok:true, admin_code: next, first_init: true });
  }

  // ✅ ĐÃ CÓ: bắt buộc current đúng
  if(current !== existing) {
    return res.status(403).json({ error: "admin_code invalid" });
  }

  setSetting("admin_code", next);
  logAudit({ actor: "admin", action: "ROTATE_ADMIN_CODE", code: "", detail: {} });
  res.json({ ok:true, admin_code: next });
});
