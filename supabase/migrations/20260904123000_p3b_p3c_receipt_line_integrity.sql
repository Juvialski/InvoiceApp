-- P3B/P3C receipt-line membership integrity.
--
-- Daily Site Log material deliveries remain field observations. When an
-- observation links to a formal PO receipt and PO line, however, that pair must
-- identify an actual line on that receipt. This prevents a valid receipt header
-- from being paired with a different line from the same purchase order.

alter table public.engineering_daily_site_log_material_deliveries
  add constraint engineering_daily_site_log_material_deliveries_receipt_line_fk
  foreign key (company_id, purchase_order_receipt_id, purchase_order_line_id)
  references public.purchase_order_receipt_lines(company_id, purchase_order_receipt_id, purchase_order_line_id)
  on delete restrict
  not valid;

alter table public.engineering_daily_site_log_material_deliveries
  validate constraint engineering_daily_site_log_material_deliveries_receipt_line_fk;
