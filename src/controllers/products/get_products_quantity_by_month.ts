import { Context } from 'hono/dist/types/context';
import { KardexService } from '../../services/products.service';
import { getDb } from '../../config/db';

export const getProductsQuantityByMonth = async (c: Context) => {
  const ref = c.req.query('ref')?.trim();
  if (ref && process.env.NODE_ENV === 'production' && process.env.ENABLE_DB_REF !== 'true') {
    return c.json({ success: false, error: 'Not Found' }, 404);
  }
  const db = getDb(ref);

  const itemId = c.req.query('item_id');
  if (!itemId) {
    return c.json({ success: false, error: 'item_id is required' }, 400);
  }

  const { rows } = await db.query(
    `
    WITH months AS (
      SELECT 
        generate_series(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date as month_start
    ),
    monthly_data AS (
      SELECT 
        m.month_start,
        CASE 
          WHEN EXTRACT(MONTH FROM m.month_start) = 1 THEN 'Ene ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 2 THEN 'Feb ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 3 THEN 'Mar ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 4 THEN 'Abr ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 5 THEN 'May ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 6 THEN 'Jun ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 7 THEN 'Jul ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 8 THEN 'Ago ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 9 THEN 'Sep ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 10 THEN 'Oct ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 11 THEN 'Nov ' || EXTRACT(YEAR FROM m.month_start)
          WHEN EXTRACT(MONTH FROM m.month_start) = 12 THEN 'Dic ' || EXTRACT(YEAR FROM m.month_start)
        END as month,
        COALESCE(SUM(k.quantity), 0) as quantity
      FROM months m
      LEFT JOIN kardex k ON DATE_TRUNC('month', k.invoice_date) = m.month_start
        AND k.item_id = $1
        AND k.invoice_date >= (CURRENT_DATE - INTERVAL '12 months')
        AND k.deleted_at IS NULL
      GROUP BY m.month_start, EXTRACT(MONTH FROM m.month_start), EXTRACT(YEAR FROM m.month_start)
      ORDER BY m.month_start DESC
    )
    SELECT month, quantity FROM monthly_data
    `,
    [itemId]
  );

  return c.json({
    success: true,
    data: rows
  }, 200);
};