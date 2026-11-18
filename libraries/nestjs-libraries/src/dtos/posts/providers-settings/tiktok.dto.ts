import {
  IsBoolean,
  ValidateIf,
  IsIn,
  IsString,
  MaxLength,
  IsOptional,
  IsDefined,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';

export class TikTokMusic {
  @IsDefined()
  @IsString()
  @JSONSchema({
    description:
      'The commercial music library track id, taken from the "id" returned by the musicSearch function.',
  })
  id: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  audio_volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  video_volume?: number;
}

export class TikTokLocation {
  @IsDefined()
  @IsString()
  @JSONSchema({
    description:
      'The location tag id, taken from the "id" returned by the locationSearch function.',
  })
  id: string;

  @IsDefined()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;
}

// TikTok Content Sharing Guidelines: when the commercial content disclosure
// is switched on, the user must pick "Your brand" and/or "Branded content"
// before the post can be published.
function TikTokDisclosureNeedsOption(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'tikTokDisclosureNeedsOption',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as TikTokDto;
          if (dto.content_posting_method === 'UPLOAD' || !value) {
            return true;
          }
          return !!(dto.brand_organic_toggle || dto.brand_content_toggle);
        },
      },
    });
}

// TikTok Content Sharing Guidelines: branded content can never be private,
// so "Branded content" + SELF_ONLY must not reach the publish step.
function TikTokBrandedContentNotPrivate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'tikTokBrandedContentNotPrivate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const dto = args.object as TikTokDto;
          if (dto.content_posting_method === 'UPLOAD' || !value) {
            return true;
          }
          return dto.privacy_level !== 'SELF_ONLY';
        },
      },
    });
}

// TikTok only honors most of these settings on a DIRECT_POST. With
// content_posting_method=UPLOAD the media lands in the user's TikTok inbox as a
// draft, and TikTok's inbox/upload endpoints accept nothing but the title /
// description - every other field below is silently discarded.
// video_made_with_ai / duet / stitch are additionally video-only: TikTok's photo
// post_info has no is_aigc, disable_duet or disable_stitch field.
// music / location are TikTok Business only: the legacy TikTok provider ignores
// them (its Content Posting API has no music_sound_info / location fields).
// Fields stay required here (existing clients depend on it); the constraints are
// documented, not enforced.
export class TikTokDto {
  @ValidateIf((p) => p.title)
  @MaxLength(90)
  @JSONSchema({
    description:
      'Used as the title of the post. The only setting TikTok keeps when content_posting_method=UPLOAD.',
  })
  title: string;

  // No default any more, and the field is hidden in UPLOAD mode (TikTok ignores
  // it there), so it is only required for DIRECT_POST.
  @ValidateIf((p) => p.content_posting_method !== 'UPLOAD')
  @IsIn(
    [
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'SELF_ONLY',
    ],
    { message: 'Please choose who can see this post' }
  )
  @IsString()
  @JSONSchema({
    description:
      'Required, no default: TikTok requires the user to pick the audience explicitly. Only the values returned by the creatorInfo function (privacy_level_options) are accepted for the account. Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  privacy_level:
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY';

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no duet setting for photo posts.',
  })
  duet: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no stitch setting for photo posts.',
  })
  stitch: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  comment: boolean;

  @IsIn(['yes', 'no'])
  @JSONSchema({
    description:
      'Photo posts only, and only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD. ' +
      'On TikTok Business, "yes" attaches a random commercial music library track and overrides the music setting; ' +
      'on legacy TikTok, "yes" lets TikTok auto-add its recommended music.',
  })
  autoAddMusic: 'yes' | 'no';

  @ValidateIf((p) => p.disclose === true)
  @IsBoolean()
  @TikTokDisclosureNeedsOption({
    message:
      'You need to indicate if your content promotes yourself, a third party, or both.',
  })
  @JSONSchema({
    description:
      'Commercial content disclosure switch. Off by default. When true, at least one of brand_organic_toggle / brand_content_toggle must be true. Applied only when content_posting_method=DIRECT_POST.',
  })
  disclose?: boolean;

  @IsBoolean()
  @TikTokBrandedContentNotPrivate({
    message: 'Branded content cannot be private, choose a different audience',
  })
  @JSONSchema({
    description:
      'Marks the post as paid partnership ("Branded content"). Cannot be combined with privacy_level=SELF_ONLY. Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  brand_content_toggle: boolean;

  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description:
      'Labels the post as AI generated. Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no AI-generated label for photo posts, and discards it on UPLOAD.',
  })
  video_made_with_ai: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  brand_organic_toggle: boolean;

  @Type(() => TikTokMusic)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'TikTok Business only, and only when content_posting_method=DIRECT_POST. Attaches a commercial music library track to the post (use the musicSearch function to find one). audio_volume / video_volume apply to video posts only. For photos, ignored when autoAddMusic is "yes" (a random track is attached instead).',
  })
  music?: TikTokMusic;

  @Type(() => TikTokLocation)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'TikTok Business only, and only when content_posting_method=DIRECT_POST. Tags the post with a location (use the locationSearch function to find one).',
  })
  location?: TikTokLocation;

  @IsIn(['DIRECT_POST', 'UPLOAD'])
  @IsString()
  @JSONSchema({
    description:
      'Required. Use "DIRECT_POST" to actually publish the post to TikTok. ' +
      '"UPLOAD" does NOT publish: it only sends the media to the user\'s TikTok app inbox, ' +
      'where they must manually finish and publish it within 24 hours or it is discarded, ' +
      'and it makes TikTok ignore every other setting here. ' +
      'Only use "UPLOAD" when the user explicitly asks to review or edit the post inside the TikTok app before publishing.',
  })
  content_posting_method: 'DIRECT_POST' | 'UPLOAD';
}
