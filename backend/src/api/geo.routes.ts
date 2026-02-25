/**
 * @file geo.routes.ts
 * @description Proxy endpoints for Google Places API.
 * Keeps the API key server-side and avoids CORS issues on web.
 *
 * @hebrew נקודות קצה לחיפוש כתובות דרך Google Places
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';

export const geoRouter = Router();

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

/**
 * @description Proxies Google Places Autocomplete API.
 * Returns address suggestions for Hebrew input in Israel.
 * @hebrew חיפוש כתובות עם השלמה אוטומטית
 *
 * GET /v1/geo/autocomplete?input=הרצל+10
 */
geoRouter.get('/autocomplete', requireAuth, async (req: Request, res: Response) => {
  const input = req.query.input as string;
  if (!input || input.length < 2) {
    res.json({ predictions: [] });
    return;
  }

  if (!PLACES_API_KEY) {
    res.status(503).json({
      error: 'PLACES_NOT_CONFIGURED',
      messageHe: 'שירות חיפוש כתובות אינו מוגדר.',
    });
    return;
  }

  try {
    const params = new URLSearchParams({
      input,
      key: PLACES_API_KEY,
      language: 'he',
      components: 'country:il',
      types: 'address',
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
    );
    const data: any = await response.json();

    const predictions = (data.predictions || []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text,
      secondaryText: p.structured_formatting?.secondary_text,
    }));

    res.json({ predictions });
  } catch {
    res.status(502).json({
      error: 'PLACES_API_ERROR',
      messageHe: 'שגיאה בחיפוש כתובות. נסה שוב.',
    });
  }
});

/**
 * @description Proxies Google Places Details API.
 * Returns lat/lng and formatted address for a place ID.
 * @hebrew קבלת פרטי מיקום (קואורדינטות) לפי place ID
 *
 * GET /v1/geo/place-details?placeId=ChIJ...
 */
geoRouter.get('/place-details', requireAuth, async (req: Request, res: Response) => {
  const placeId = req.query.placeId as string;
  if (!placeId) {
    res.status(400).json({
      error: 'MISSING_PLACE_ID',
      messageHe: 'חסר מזהה מקום.',
    });
    return;
  }

  if (!PLACES_API_KEY) {
    res.status(503).json({
      error: 'PLACES_NOT_CONFIGURED',
      messageHe: 'שירות חיפוש כתובות אינו מוגדר.',
    });
    return;
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: PLACES_API_KEY,
      language: 'he',
      fields: 'geometry,formatted_address',
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params}`
    );
    const data: any = await response.json();

    if (data.result) {
      res.json({
        address: data.result.formatted_address,
        latitude: data.result.geometry.location.lat,
        longitude: data.result.geometry.location.lng,
      });
    } else {
      res.status(404).json({
        error: 'PLACE_NOT_FOUND',
        messageHe: 'המקום לא נמצא.',
      });
    }
  } catch {
    res.status(502).json({
      error: 'PLACES_API_ERROR',
      messageHe: 'שגיאה בקבלת פרטי מיקום. נסה שוב.',
    });
  }
});
