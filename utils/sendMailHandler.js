let nodemailer = require('nodemailer')
const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "271de269a2368f",
        pass: process.env.MAILTRAP_PASS || "f7822d0f025047",
    },
});
module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "mail reset passwrod",
            text: "lick vo day de doi passs", // Plain-text version of the message
            html: "lick vo <a href=" + url + ">day</a> de doi passs", // HTML version of the message
        });
    },
    sendUserCredentialMail: async function (to, username, password) {
        await transporter.sendMail({
            from: '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "Thong tin tai khoan moi",
            text:
                "Tai khoan cua ban da duoc tao.\n" +
                "Username: " + username + "\n" +
                "Password: " + password + "\n" +
                "Vui long doi mat khau sau khi dang nhap.",
            html:
                "<div style=\"font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;\">" +
                "<div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7eb;\">" +
                "<div style=\"margin-bottom:24px;text-align:center;\">" +
                "<div style=\"display:inline-block;background:#111827;color:#ffffff;padding:10px 18px;border-radius:999px;font-weight:700;letter-spacing:.08em;\">NNPTUD</div>" +
                "</div>" +
                "<h2 style=\"margin:0 0 12px;color:#111827;\">Tai khoan cua ban da san sang</h2>" +
                "<p style=\"margin:0 0 16px;color:#4b5563;line-height:1.6;\">He thong da tao tai khoan tu dong tu file import. Vui long dang nhap bang thong tin ben duoi va doi mat khau ngay sau lan dang nhap dau tien.</p>" +
                "<div style=\"background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;\">" +
                "<p style=\"margin:0 0 8px;color:#111827;\"><strong>Username:</strong> " + username + "</p>" +
                "<p style=\"margin:0 0 8px;color:#111827;\"><strong>Email:</strong> " + to + "</p>" +
                "<p style=\"margin:0;color:#111827;\"><strong>Password:</strong> " + password + "</p>" +
                "</div>" +
                "<p style=\"margin:16px 0 0;color:#dc2626;font-size:14px;\">Khuyen nghi: doi mat khau ngay sau khi dang nhap de dam bao an toan.</p>" +
                "</div>" +
                "</div>"
        });
    }
}
