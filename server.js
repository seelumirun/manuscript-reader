const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Email transporter configuration
// Configure with your email service (Gmail, SendGrid, etc.)
const transporter = nodemailer.createTransport({
    // Option 1: Gmail (enable "Less secure app access" or use App Password)
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }

    // Option 2: SendGrid
    // host: 'smtp.sendgrid.net',
    // port: 587,
    // auth: {
    //     user: 'apikey',
    //     pass: process.env.SENDGRID_API_KEY
    // }

    // Option 3: Custom SMTP
    // host: process.env.SMTP_HOST,
    // port: process.env.SMTP_PORT,
    // secure: false,
    // auth: {
    //     user: process.env.SMTP_USER,
    //     pass: process.env.SMTP_PASS
    // }
});

// API endpoint to send comment emails
app.post('/api/send-comment', async (req, res) => {
    try {
        const { to, subject, documentName, chapter, selectedText, comment, timestamp } = req.body;

        // Validate required fields
        if (!selectedText || !comment) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        // Format the email
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #1a1a1a; color: #fff; padding: 20px; border-radius: 8px 8px 0 0; }
                    .header h1 { margin: 0; font-size: 20px; }
                    .content { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; }
                    .passage { background: #fff; border-left: 4px solid #6b9fff; padding: 15px; margin: 15px 0; font-style: italic; color: #555; }
                    .comment { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin: 15px 0; }
                    .comment-label { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 8px; }
                    .meta { font-size: 12px; color: #888; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e0e0e0; }
                    .footer { background: #1a1a1a; color: #888; padding: 15px 20px; border-radius: 0 0 8px 8px; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>New Comment on Manuscript</h1>
                    </div>
                    <div class="content">
                        <p><strong>Document:</strong> ${escapeHtml(documentName)}</p>
                        ${chapter ? `<p><strong>Chapter:</strong> ${escapeHtml(chapter)}</p>` : ''}

                        <div class="comment-label">Selected Passage:</div>
                        <div class="passage">
                            "${escapeHtml(selectedText)}"
                        </div>

                        <div class="comment-label">Reader's Comment:</div>
                        <div class="comment">
                            ${escapeHtml(comment)}
                        </div>

                        <div class="meta">
                            <strong>Submitted:</strong> ${new Date(timestamp).toLocaleString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </div>
                    </div>
                    <div class="footer">
                        Sent from Manuscript Reader
                    </div>
                </div>
            </body>
            </html>
        `;

        const plainText = `
New Comment on Manuscript

Document: ${documentName}${chapter ? `\nChapter: ${chapter}` : ''}

Selected Passage:
"${selectedText}"

Reader's Comment:
${comment}

Submitted: ${new Date(timestamp).toLocaleString()}
        `.trim();

        // Send email
        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: to || process.env.RECIPIENT_EMAIL,
            subject: subject || `New Comment on "${documentName}"`,
            text: plainText,
            html: emailHtml
        };

        await transporter.sendMail(mailOptions);

        res.json({
            success: true,
            message: 'Comment sent successfully'
        });

    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send email'
        });
    }
});

// Helper function to escape HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Manuscript Reader server running on http://localhost:${PORT}`);
});
