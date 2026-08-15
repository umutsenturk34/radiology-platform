import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * `POST /api/v1/auth/login` request body (docs/API_CONTRACT.md section 17).
 *
 * The password is only validated for presence and a sane length; complexity
 * rules belong to user creation, not to login.
 */
export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  // Each constraint carries a distinct message: class-validator reports every
  // failing rule, and repeating one message reads like a bug to the client.
  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password is required.' })
  @MaxLength(256, { message: 'Password must be at most 256 characters.' })
  password: string;
}
