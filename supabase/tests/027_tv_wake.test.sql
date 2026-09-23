-- Разбудить стену с пульта (D-105): `p_wake` будит на два часа от «сейчас», `false`
-- возвращает ночь, другие команды разбудку не трогают; будит только директор, киоск
-- видит отметку в своей строке.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007.
begin;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$ select tv_control(p_wake => true) $$, 'the director wakes the wall');
select is((select awake_until from tv_state), now() + interval '2 hours', 'for two hours from now');
select lives_ok($$ select tv_control(p_scene => 'team') $$, 'another command');
select is((select awake_until from tv_state), now() + interval '2 hours', 'leaves the wall awake');
select lives_ok($$ select tv_control(p_mode => 'ether') $$, 'giving the ether back');
select is((select awake_until from tv_state), now() + interval '2 hours', 'leaves it awake too');
select is((select awake_until from tv_control(p_wake => false)), null::timestamptz, 'false puts the wall back to sleep');
select is((select awake_until from tv_control(p_clock => 'digital')), null::timestamptz, 'and a later command does not wake it');

select tv_control(p_wake => true);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select awake_until from tv_state), now() + interval '2 hours', 'the kiosk sees the mark in its row');
select throws_ok($$ select tv_control(p_wake => false) $$, 'P0001', 'forbidden', 'the kiosk cannot put itself to sleep');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_control(p_wake => true) $$, 'P0001', 'forbidden', 'an employee cannot wake the wall');

set local role postgres;
select * from finish();
rollback;
