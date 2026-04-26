import { env } from "@/config/env";
import type {
  PasswordResetNotification,
  PasswordResetNotifier
} from "@/modules/auth/application/ports/password-reset-notifier";
import { logger } from "@/shared/observability/logger";

export class LoggerPasswordResetNotifier implements PasswordResetNotifier {
  sendPasswordReset(notification: PasswordResetNotification): Promise<void> {
    if (env.NODE_ENV === "production") {
      logger.warn(
        {
          email: notification.email,
          expiresAt: notification.expiresAt,
          userId: notification.userId
        },
        "Password reset requested but delivery provider is not configured"
      );

      return Promise.resolve();
    }

    logger.info(
      {
        email: notification.email,
        expiresAt: notification.expiresAt,
        resetToken: notification.token,
        userId: notification.userId
      },
      "Password reset token generated"
    );

    return Promise.resolve();
  }
}
