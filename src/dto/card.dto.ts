import { IsDefined, IsString, IsUUID, Length, IsOptional } from "class-validator";

export class Card {
  @IsString()
  @IsDefined()
  @Length(5, 30)
  name: string;

  @IsDefined()
  @IsUUID()
  listId: string;

  @IsString()
  @IsDefined()
  description: string;

  @IsOptional()  // Hacer dueDate opcional
  @IsString()
  dueDate?: string;

  @IsDefined()
  @IsUUID()
  ownerUserId: string;
}
