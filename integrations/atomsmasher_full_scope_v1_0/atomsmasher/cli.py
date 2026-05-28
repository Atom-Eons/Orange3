from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from .storage import Store
from .engines import SourceEngine, OrderSpine, CommitmentCodec, EquationMemory, FeatureExecutor, TotalWorkCompiler, LocalProofLab, demo
from .utils import jdump
from .version import VERSION, CODENAME, SCHEMA_VERSION, SYSTEM_LAW

def build_parser():
    p=argparse.ArgumentParser(prog='atomsmasher', description='AtomSmasher v1.0 Full Scope Total Work Compiler')
    p.add_argument('--db', default='atomsmasher.db')
    sub=p.add_subparsers(dest='cmd')
    sub.add_parser('init')
    s=sub.add_parser('ingest-text'); s.add_argument('--title',required=True); s.add_argument('--text',required=True)
    s=sub.add_parser('ingest-file'); s.add_argument('path')
    s=sub.add_parser('orders'); s.add_argument('--add'); s.add_argument('--json', action='store_true')
    s=sub.add_parser('show-hot')
    s=sub.add_parser('coverage'); s.add_argument('--source-id')
    s=sub.add_parser('search'); s.add_argument('query')
    s=sub.add_parser('air')
    s=sub.add_parser('equation-fit'); s.add_argument('--name',default='series'); s.add_argument('--values',required=True)
    s=sub.add_parser('equation-show'); s.add_argument('eq_id')
    s=sub.add_parser('compile'); s.add_argument('query')
    s=sub.add_parser('execute-addition'); s.add_argument('name_or_id')
    s=sub.add_parser('run-all-additions'); s.add_argument('--limit',type=int)
    s=sub.add_parser('proof')
    s=sub.add_parser('v10-demo')
    return p

def main(argv=None):
    args=build_parser().parse_args(argv)
    store=Store(args.db)
    if args.cmd in {None,'init'}:
        print(jdump({'version':VERSION,'codename':CODENAME,'schema_version':SCHEMA_VERSION,'features':store.one('SELECT COUNT(*) c FROM features')['c'],'law':SYSTEM_LAW})); return
    if args.cmd=='ingest-text': print(jdump(SourceEngine(store).ingest_text(args.title,args.text))); return
    if args.cmd=='ingest-file': print(jdump(SourceEngine(store).ingest_file(args.path))); return
    if args.cmd=='orders':
        if args.add: OrderSpine(store).add_order(args.add)
        print(jdump(OrderSpine(store).digest())); return
    if args.cmd=='show-hot': print(jdump(store.all('SELECT * FROM heat_items ORDER BY heat DESC, created_at DESC'))); return
    if args.cmd=='coverage':
        if args.source_id: rows=store.all('SELECT * FROM coverage_receipts WHERE source_id=?',(args.source_id,))
        else: rows=store.all('SELECT * FROM coverage_receipts ORDER BY created_at DESC')
        print(jdump(rows)); return
    if args.cmd=='search': print(jdump(SourceEngine(store).search(args.query))); return
    if args.cmd=='air': print(CommitmentCodec(store).active_air(limit=100)); return
    if args.cmd=='equation-fit':
        vals=[float(x.strip()) for x in args.values.split(',') if x.strip()]
        print(jdump(EquationMemory(store).fit_series(vals,args.name))); return
    if args.cmd=='equation-show':
        print(jdump({'equation':store.one('SELECT * FROM equations WHERE id=?',(args.eq_id,)), 'reconstruction':EquationMemory(store).reconstruct(args.eq_id)})); return
    if args.cmd=='compile': print(jdump(TotalWorkCompiler(store).compile(args.query))); return
    if args.cmd=='execute-addition': print(jdump(FeatureExecutor(store).execute_feature(args.name_or_id))); return
    if args.cmd=='run-all-additions': print(jdump(FeatureExecutor(store).run_all(args.limit))); return
    if args.cmd=='proof': print(jdump(LocalProofLab(store).run_probes())); return
    if args.cmd=='v10-demo': print(jdump(demo(store))); return

if __name__ == '__main__': main()
