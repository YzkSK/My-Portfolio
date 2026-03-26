import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { Resend } from "resend";

setGlobalOptions({ maxInstances: 10, region: "asia-northeast1" });

admin.initializeApp();

const resendApiKey = defineSecret("RESEND_API_KEY");

export const sendPasswordResetEmail = onCall(
  { secrets: [resendApiKey] },
  async (request) => {
    const email = request.data?.email;
    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "メールアドレスが指定されていません");
    }

    let resetLink: string;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email);
    } catch {
      // ユーザーが存在しない場合も成功を返す（メールアドレス列挙対策）
      return { success: true };
    }

    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: "noreply@yzkdev.com",
      to: email,
      subject: "パスワードの再設定",
      html: `
        <p>パスワード再設定のリクエストを受け付けました。</p>
        <p>以下のリンクからパスワードを再設定してください。</p>
        <p><a href="${resetLink}">パスワードを再設定する</a></p>
        <p>このリンクの有効期限は1時間です。</p>
        <p>心当たりがない場合は、このメールを無視してください。</p>
      `,
    });

    return { success: true };
  }
);
