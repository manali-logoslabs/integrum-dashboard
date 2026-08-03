-- Fix lapse_units in c9_unit_monthly from monthly_banking_settlement.surplus_lapsed_kwh
-- Run this in pgAdmin or psql against the integrum database

UPDATE c9_unit_monthly um
SET    lapse_units = sub.surplus_lapsed_kwh
FROM (
    SELECT
        consumption_unit_id,
        month,
        SUM(surplus_lapsed_kwh) AS surplus_lapsed_kwh
    FROM   monthly_banking_settlement
    WHERE  tenant_id = 1
      AND  surplus_lapsed_kwh > 0
    GROUP  BY consumption_unit_id, month
) sub
WHERE  um.unit_id  = sub.consumption_unit_id
  AND  um.month    = sub.month
  AND  um.tenant_id = 1;

-- Verify the result
SELECT
    TO_CHAR(month, 'YYYY-MM') AS month,
    SUM(lapse_units)          AS total_lapsed_kwh,
    SUM(grid_consumption)     AS total_grid_kwh
FROM   c9_unit_monthly
WHERE  tenant_id = 1
GROUP  BY month
ORDER  BY month;
