function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (!role || String(role).toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

module.exports = requireAdmin;
