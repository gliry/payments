import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PasskeyOptionsDto {
  @ApiProperty({ enum: ['register', 'login'], example: 'register' })
  @IsIn(['register', 'login'])
  mode: 'register' | 'login';

  @ApiProperty({
    example: 'alice@example.com',
    description: 'Username for registration, or username/credentialId for login',
  })
  @IsString()
  username: string;
}
