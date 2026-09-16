const path = require('path');
const fs = require('fs');

const queriesDir = path.join(__dirname, '../../queries');
const queryFiles = fs.readdirSync(queriesDir).filter((f) => f.endsWith('.js'));

describe('SQL query modules', () => {
  queryFiles.forEach((file) => {
    it(`${file} exports SQL with placeholders`, () => {
      const sql = require(path.join(queriesDir, file));
      expect(typeof sql).toBe('string');
      const upper = sql.toUpperCase();
      expect(upper).toMatch(/SELECT|INSERT|UPDATE|DELETE/);
      expect(sql).toMatch(/\$1/);
    });
  });
});
