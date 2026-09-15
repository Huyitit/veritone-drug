-- VE-26450: seed the per-destination media constraints declared in V3_299.
--
-- Additive DATA only — no DDL. Idempotent, with pre-generated ids identical across environments.
-- destination_type_id values are the V3_292 (YouTube) and V3_295 (Facebook/Instagram/TikTok) seeds.
--
-- Values come from Ayrshare's published media guidelines and, where the two differ, from the rejections the
-- platform itself returned (Instagram's docs recommend a 540x960 minimum; it enforced a 320px floor). See the
-- ticket for the recovered vendor error text.
--
-- DO NOT TIGHTEN FACEBOOK OR YOUTUBE without an observed rejection or a product decision naming the post type.
-- Their post type is unknown and the gap is large — Facebook regular video allows 4 hours where Reels allow 90
-- seconds; YouTube regular has no documented limit where Shorts cap at 3 minutes. Both are therefore seeded at
-- the PERMISSIVE figures: guessing the restrictive ones would reject publishes the platform accepts, which is
-- worse than the late failure this check replaces. Instagram is the exception because its post type is evidenced.
--
-- durationMs is the only property the server measures today; widthPx, heightPx and aspectRatio are declared
-- where the vendor documents them and take effect when VE-26886 makes the published rendition knowable. Adding
-- a limit here needs no migration and no API change.
--
-- aspectRatio is omitted for TikTok/Facebook/YouTube: they permit discrete ratios ("9:16 or 16:9") rather than a
-- band, and the enum that would express it should be seeded from an observed rejection, not from inference.

INSERT INTO public.destination_media_constraint
  (id, destination_type_id, post_type,
   constraint_schema,
   recommended_media)
VALUES
  -- Instagram Reels: 3s-900s, 320px floor per dimension, max 1920x3600, aspect band 0.01:1 - 10:1.
  ('4a1d9f02-6c3b-4e58-9a17-7b2e5c8d0f31'::uuid, 'b0cc0c8e-409b-44d5-9d0f-389144aa53e0'::uuid, 'reels',
   '{"properties":{
       "durationMs":  {"minimum": 3000, "maximum": 900000},
       "widthPx":     {"minimum": 320,  "maximum": 1920},
       "heightPx":    {"minimum": 320,  "maximum": 3600},
       "aspectRatio": {"minimum": 0.01, "maximum": 10.0}
     }}'::jsonb,
   '{"widthPx":1080,"heightPx":1920,"aspectRatio":0.5625}'::jsonb),

  -- TikTok video: 3s-600s, 360-4096px per dimension. One post type, so no ambiguity — real enforced limits.
  ('7c5e2b81-3d4a-4f19-8e62-9a1c7d3b5e04'::uuid, '255f1b92-1ce6-494d-b601-1fa6cae36cec'::uuid, 'video',
   '{"properties":{
       "durationMs": {"minimum": 3000, "maximum": 600000},
       "widthPx":    {"minimum": 360,  "maximum": 4096},
       "heightPx":   {"minimum": 360,  "maximum": 4096}
     }}'::jsonb,
   '{"widthPx":1080,"heightPx":1920,"aspectRatio":0.5625}'::jsonb),

  -- Facebook regular feed video (PERMISSIVE): max 4 hours. No documented minimum or hard dimensions.
  ('b3f8c6d2-5e17-4a9b-8c04-2d6e9f1a7b35'::uuid, 'dcadf81c-9127-4db8-978d-2cf3b0109187'::uuid, 'video',
   '{"properties":{
       "durationMs": {"maximum": 14400000}
     }}'::jsonb,
   '{"widthPx":1280,"heightPx":720,"aspectRatio":1.7778}'::jsonb),

  -- YouTube regular video (PERMISSIVE): no documented duration or dimension limits, so nothing is enforceable.
  -- The row exists so the API reports "nothing enforced" rather than an empty list a client must interpret.
  ('e1a7d4b9-8c26-4f53-9b71-3e5a2c8d6f10'::uuid, 'c42be8c9-a848-4bc7-b461-5001dc342232'::uuid, 'video',
   '{"properties":{}}'::jsonb,
   '{"aspectRatio":1.7778}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  destination_type_id      = EXCLUDED.destination_type_id,
  post_type                = EXCLUDED.post_type,
  constraint_schema        = EXCLUDED.constraint_schema,
  recommended_media        = EXCLUDED.recommended_media,
  updated_at               = NOW();
