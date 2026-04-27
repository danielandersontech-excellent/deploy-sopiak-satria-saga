/**
 * AUDIT LOG SERVICE
 */
const auditRepo = require('../repositories/auditlog.repository');

class AuditlogService {
  async getAll(filters) { return auditRepo.findAll(filters); }
  async getSummary() { return auditRepo.getSummary(); }
  async getByUser(userId) { return auditRepo.findByUser(userId); }
}

module.exports = new AuditlogService();
