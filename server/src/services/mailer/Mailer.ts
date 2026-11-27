export interface PasswordResetEmail {
  to: string;
  name: string;
  resetLink: string;
}

export interface EmailVerificationEmail {
  to: string;
  name: string;
  verificationLink: string;
}

export interface Mailer {
  sendPasswordReset(input: PasswordResetEmail): Promise<void>;
  sendEmailVerification(input: EmailVerificationEmail): Promise<void>;
  sendTransactionalEmail(input: TransactionalEmail): Promise<void>;
}

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
