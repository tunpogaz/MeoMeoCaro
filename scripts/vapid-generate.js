/**
 * Tao cap khoa VAPID cho Web Push.
 * Chi in ra terminal; khong ghi vao file, log hay repo.
 *
 *   npm run vapid:generate
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('VAPID_PUBLIC_KEY=' + publicKey);
console.log('VAPID_PRIVATE_KEY=' + privateKey);
console.log('');
console.log('Dat 3 bien sau trong dashboard hosting (vi du Render > Environment):');
console.log('  VAPID_PUBLIC_KEY   = (dong dau)');
console.log('  VAPID_PRIVATE_KEY  = (dong hai)');
console.log('  VAPID_SUBJECT      = mailto:email-cua-ban@example.com');
console.log('');
console.log('Khong commit, khong dan khoa rieng vao bao cao hay tin nhan.');
