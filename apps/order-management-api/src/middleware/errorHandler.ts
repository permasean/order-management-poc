import type { Request, Response, NextFunction } from "express";

export class AppError extends Error {
	constructor(
		public statusCode: number,
		message: string,
	) {
		super(message);
	}
}

export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_next: NextFunction,
) {
	if (err instanceof AppError) {
		res.status(err.statusCode).json({ error: err.message });
		return;
	}

	console.error(err);
	res.status(500).json({ error: "Internal server error" });
}
