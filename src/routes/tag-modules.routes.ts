import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { resolveDb } from '../utils/request.utils';

const RelationSchema = z.object({
  id_tag: z.number().int().positive(),
  id_module: z.number().int().positive(),
});

const RelationParamSchema = z.object({
  id_module: z.string().regex(/^\d+$/, 'id_module must be a positive integer'),
  id_tag: z.string().regex(/^\d+$/, 'id_tag must be a positive integer'),
});

const ModuleParamSchema = z.object({
  id_module: z.string().regex(/^\d+$/, 'id_module must be a positive integer'),
});

const RefQuerySchema = z.object({
  ref: z.string().min(1, 'ref query parameter is required'),
});

const ErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
});

const RelationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id_tag: z.number().int().positive(),
    id_module: z.number().int().positive(),
  }),
});

const ModuleTagsResponseSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    tag_name: z.string(),
    by_order: z.number().int(),
  })
);

const parseJson = async (c: Context) => {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
};

export const registerTagModulesRoutes = (apiV1: any) => {
  const createTagModuleRoute = createRoute({
    method: 'post',
    path: '/tag-modules',
    request: {
      query: RefQuerySchema,
      body: {
        content: {
          'application/json': {
            schema: RelationSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Relation created',
        content: { 'application/json': { schema: RelationResponseSchema } },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      409: {
        description: 'Relation already exists',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
    tags: ['Tag Modules'],
  });

  const listTagsByModuleRoute = createRoute({
    method: 'get',
    path: '/tag-modules/module/{id_module}',
    request: {
      query: RefQuerySchema,
      params: ModuleParamSchema,
    },
    responses: {
      200: {
        description: 'Tags linked to module',
        content: { 'application/json': { schema: ModuleTagsResponseSchema } },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
    tags: ['Tag Modules'],
  });

  const getTagModuleRoute = createRoute({
    method: 'get',
    path: '/tag-modules/{id_module}/{id_tag}',
    request: {
      query: RefQuerySchema,
      params: RelationParamSchema,
    },
    responses: {
      200: {
        description: 'Relation found',
        content: { 'application/json': { schema: RelationResponseSchema } },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      404: {
        description: 'Relation not found',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
    tags: ['Tag Modules'],
  });

  const updateTagModuleRoute = createRoute({
    method: 'put',
    path: '/tag-modules/{id_module}/{id_tag}',
    request: {
      query: RefQuerySchema,
      params: RelationParamSchema,
      body: {
        content: {
          'application/json': {
            schema: RelationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Relation updated',
        content: { 'application/json': { schema: RelationResponseSchema } },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      404: {
        description: 'Relation not found',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
    tags: ['Tag Modules'],
  });

  const deleteTagModuleRoute = createRoute({
    method: 'delete',
    path: '/tag-modules/{id_module}/{id_tag}',
    request: {
      query: RefQuerySchema,
      params: RelationParamSchema,
    },
    responses: {
      200: {
        description: 'Relation deleted',
        content: { 'application/json': { schema: RelationResponseSchema } },
      },
      400: {
        description: 'Bad request',
        content: { 'application/json': { schema: ErrorSchema } },
      },
      404: {
        description: 'Relation not found',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    },
    tags: ['Tag Modules'],
  });

  // Crea una relacion tag <-> module
  apiV1.openapi(createTagModuleRoute, async (c: Context) => {
    const resolved = resolveDb(c);
    if (resolved.kind === 'error') return c.json(resolved.body, resolved.status);

    const body = await parseJson(c);
    const parsed = RelationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: parsed.error.issues[0]?.message },
        400
      );
    }

    const { id_tag, id_module } = parsed.data;
    const { db } = resolved;

    const exists = await db.query(
      `SELECT 1
       FROM tag_modules
       WHERE id_tag = $1
         AND id_module = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [id_tag, id_module]
    );

    if (exists.rowCount) {
      return c.json(
        { success: false, error: 'Conflict', message: 'Relation already exists' },
        409
      );
    }

    await db.query(
      `INSERT INTO tag_modules (id_tag, id_module)
       VALUES ($1, $2)`,
      [id_tag, id_module]
    );

    return c.json({ success: true, data: { id_tag, id_module } }, 201);
  });

  // Devuelve tags por modulo (array simple)
  apiV1.openapi(listTagsByModuleRoute, async (c: Context) => {
    const resolved = resolveDb(c);
    if (resolved.kind === 'error') return c.json(resolved.body, resolved.status);

    const paramsParsed = ModuleParamSchema.safeParse(c.req.param());
    if (!paramsParsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: paramsParsed.error.issues[0]?.message },
        400
      );
    }

    const idModule = Number(paramsParsed.data.id_module);
    const { db } = resolved;

    const result = await db.query(
      `SELECT t.id_tag AS id, t.tag_name, t.by_order
       FROM tag_modules tm
       INNER JOIN tags t ON t.id_tag = tm.id_tag
       WHERE tm.id_module = $1
         AND tm.deleted_at IS NULL
         AND t.deleted_at IS NULL
       ORDER BY t.by_order ASC, t.id_tag ASC`,
      [idModule]
    );

    return c.json(result.rows, 200);
  });

  // Obtiene una relacion especifica por llave compuesta
  apiV1.openapi(getTagModuleRoute, async (c: Context) => {
    const resolved = resolveDb(c);
    if (resolved.kind === 'error') return c.json(resolved.body, resolved.status);

    const paramsParsed = RelationParamSchema.safeParse(c.req.param());
    if (!paramsParsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: paramsParsed.error.issues[0]?.message },
        400
      );
    }

    const idModule = Number(paramsParsed.data.id_module);
    const idTag = Number(paramsParsed.data.id_tag);
    const { db } = resolved;

    const result = await db.query(
      `SELECT id_module, id_tag
       FROM tag_modules
       WHERE id_module = $1
         AND id_tag = $2
         AND deleted_at IS NULL`,
      [idModule, idTag]
    );

    if (!result.rowCount) {
      return c.json({ success: false, error: 'Not Found', message: 'Relation not found' }, 404);
    }

    return c.json({ success: true, data: result.rows[0] }, 200);
  });

  // Actualiza una relacion por llave compuesta
  apiV1.openapi(updateTagModuleRoute, async (c: Context) => {
    const resolved = resolveDb(c);
    if (resolved.kind === 'error') return c.json(resolved.body, resolved.status);

    const paramsParsed = RelationParamSchema.safeParse(c.req.param());
    if (!paramsParsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: paramsParsed.error.issues[0]?.message },
        400
      );
    }

    const body = await parseJson(c);
    const parsed = RelationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: parsed.error.issues[0]?.message },
        400
      );
    }

    const currentModuleId = Number(paramsParsed.data.id_module);
    const currentTagId = Number(paramsParsed.data.id_tag);
    const { id_module: nextModuleId, id_tag: nextTagId } = parsed.data;
    const { db } = resolved;

    const result = await db.query(
      `UPDATE tag_modules
       SET id_module = $1,
           id_tag = $2
       WHERE id_module = $3
         AND id_tag = $4
         AND deleted_at IS NULL
       RETURNING id_module, id_tag`,
      [nextModuleId, nextTagId, currentModuleId, currentTagId]
    );

    if (!result.rowCount) {
      return c.json({ success: false, error: 'Not Found', message: 'Relation not found' }, 404);
    }

    return c.json({ success: true, data: result.rows[0] }, 200);
  });

  // Elimina una relacion por llave compuesta
  apiV1.openapi(deleteTagModuleRoute, async (c: Context) => {
    const resolved = resolveDb(c);
    if (resolved.kind === 'error') return c.json(resolved.body, resolved.status);

    const paramsParsed = RelationParamSchema.safeParse(c.req.param());
    if (!paramsParsed.success) {
      return c.json(
        { success: false, error: 'Bad Request', message: paramsParsed.error.issues[0]?.message },
        400
      );
    }

    const idModule = Number(paramsParsed.data.id_module);
    const idTag = Number(paramsParsed.data.id_tag);
    const { db } = resolved;

    const result = await db.query(
      `DELETE FROM tag_modules
       WHERE id_module = $1
         AND id_tag = $2
       RETURNING id_module, id_tag`,
      [idModule, idTag]
    );

    if (!result.rowCount) {
      return c.json({ success: false, error: 'Not Found', message: 'Relation not found' }, 404);
    }

    return c.json({ success: true, data: result.rows[0] }, 200);
  });
};
