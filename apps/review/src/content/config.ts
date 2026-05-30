import { z, defineCollection } from 'astro:content';

const reviewSchema = z.object({
  title:     z.string(),
  subtitle:  z.string(),
  score:     z.number().min(1).max(5),
  date:      z.string(),
  tags:      z.array(z.string()),
  thumbnail: z.string(),
  summary:   z.string(),
  platform:  z.string().optional(), // game のみ使用
});

const exhibitionSchema = z.object({
  title:      z.string(),
  subtitle:   z.string(),
  type:       z.enum(['museum', 'art_museum', 'science', 'tech', 'archive', 'other']),
  prefecture: z.string(),
  address:    z.string(),
  lat:        z.number(),
  lng:        z.number(),
  score:      z.number().min(1).max(5),
  date:       z.string(),
  tags:       z.array(z.string()),
  thumbnail:  z.string(),
  summary:    z.string(),
});

export const collections = {
  manga:      defineCollection({ type: 'content', schema: reviewSchema }),
  game:       defineCollection({ type: 'content', schema: reviewSchema }),
  exhibition: defineCollection({ type: 'content', schema: exhibitionSchema }),
};
