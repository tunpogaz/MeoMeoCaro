/**
 * Cong cu quan tri chay CUC BO tren may chu (khong phai API):
 *   npm run admin:reset-password -- <username>
 * Sinh lien ket dat lai mat khau va in ra console cua nguoi quan tri.
 * Chi dung khi nguoi dung khong co email da xac thuc.
 */
import { closeDatabase, migrate, query } from '../db.js';
import { issueResetToken, normalizeUsername } from '../auth.js';
import { actionLink, publicBaseUrl } from '../mailer.js';

const username = normalizeUsername(process.argv[2]);
if (!username) {
  console.error('Cach dung: npm run admin:reset-password -- <username>');
  process.exit(1);
}

try {
  await migrate();
  const result = await query(
    `SELECT id, username FROM users WHERE username = ? AND deleted_at IS NULL`,
    [username]
  );
  const user = result.rows[0];
  if (!user) {
    console.error(`Khong tim thay tai khoan dang hoat dong: ${username}`);
    process.exitCode = 1;
  } else {
    const token = await issueResetToken(user.id);
    const link = actionLink('reset', token);
    const base = publicBaseUrl();
    const finalLink = link || `${base || 'http://localhost:3000'}/#reset=${token}`;
    console.log('Lien ket dat lai mat khau (chi hien thi mot lan):');
    console.log(finalLink);
    console.log('Lien ket het han theo RESET_TOKEN_MINUTES va chi dung duoc mot lan.');
  }
} catch (error) {
  console.error('[mmc] admin reset failed', error.code || error.message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
