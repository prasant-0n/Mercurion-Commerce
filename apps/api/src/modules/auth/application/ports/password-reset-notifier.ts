export type PasswordResetNotification = {
  email: string;
  expiresAt: Date;
  token: string;
  userId: string;
};

export interface PasswordResetNotifier {
  sendPasswordReset(notification: PasswordResetNotification): Promise<void>;
}
