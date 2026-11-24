import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';

@Controller('api/exam-media')
export class ExamMediaController {
	constructor(private readonly media: MediaService) {}

	@Get(':filename')
	get(
		@Param('filename') filename: string,
		@Query('expires') expires: string,
		@Query('signature') signature: string,
		@Res() response: Response,
	) {
		const directory = this.media.localMediaDirectory(filename, expires, signature);
		response.sendFile(
			filename,
			{
				root: directory,
				cacheControl: false,
				headers: { 'Cache-Control': 'private, no-store' },
			},
			(error) => {
				if (error && !response.headersSent) response.sendStatus(404);
			},
		);
	}
}
