import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class ScannerConfig {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  /** Au-dela, le scan SYNC bascule en ASYNC (post, event) ou en 503 (avatar, badge). */
  @IsDefined()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timeoutMs!: number;
}
