UPDATE public.accounts_payable
   SET amount_paid = amount,
       updated_at = now()
 WHERE status = 'paid'
   AND amount_paid < amount - 0.005;