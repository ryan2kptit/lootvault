import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "@lootvault/nest-common";
import { IsIn } from "class-validator";

import { IMAGE_EXTENSIONS, type ImageContentType, MEDIA_STORAGE, type MediaStorage } from "./media-storage";

class PresignDto {
  @ApiProperty({ enum: Object.keys(IMAGE_EXTENSIONS) })
  @IsIn(Object.keys(IMAGE_EXTENSIONS))
  contentType: ImageContentType;
}

@ApiTags("uploads")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("uploads")
export class UploadsController {
  constructor(@Inject(MEDIA_STORAGE) private readonly media: MediaStorage) {}

  /** Presigned POST for one image (<= 5 MB, png/jpeg/webp/gif). */
  @Post("presign")
  presign(@Body() body: PresignDto) {
    return this.media.presignImageUpload(body.contentType);
  }
}
