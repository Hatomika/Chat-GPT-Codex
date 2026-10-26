"""Valódi Chromium + IndexedDB. Futtatás: python tests/browser_test.py.
Tesztfüggőségek: playwright, openpyxl; Chromium, pdftotext. Nincs app-függőség.
"""
import copy
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
import zipfile
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'tests' / 'results'
ARTIFACTS.mkdir(exist_ok=True)
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
SERVER = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
threading.Thread(target=SERVER.serve_forever,daemon=True).start()
URL = f'http://127.0.0.1:{SERVER.server_port}/'

def fixture():
    s={t:[] for t in ['settings','members','membershipPeriods','rentalFees','payments','refunds','landlordPayments','auditLog','backupMetadata']}
    s['settings']=[{'id':'bandName','value':'Tesztzenekar – Őrült ütem'},{'id':'startMonth','value':'2026-01'}]
    s['members']=[{'id':'m0','name':'Árvíztűrő Tükörfúrógép','order':0,'opening':0}]
    s['membershipPeriods']=[{'id':'period','memberId':'m0','start':'2026-01','end':None}]
    s['rentalFees']=[{'id':'fee','start':'2026-01','amount':10000}]
    s['backupMetadata']=[{'id':'appSchema','value':2}]
    return s

def payment(amount=30000,id='p',date='2026-01-05'):
    return {'id':id,'memberId':'m0','amount':amount,'date':date,'note':'Őrzött befizetés','voided':False}

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw=sync_playwright().start()
        executable=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
        cls.browser=cls.pw.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}))
        print('Chromium:', cls.browser.version, flush=True)
    @classmethod
    def tearDownClass(cls): cls.browser.close();cls.pw.stop();SERVER.shutdown();SERVER.server_close()
    def setUp(self):
        self.ctx=self.browser.new_context(viewport={'width':390,'height':844},timezone_id='Europe/Budapest',locale='hu-HU',accept_downloads=True,has_touch=True,is_mobile=True)
        self.page=self.ctx.new_page();self.errors=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        self.page.on('dialog',lambda d:d.accept())
        self.page.goto(URL);self.page.wait_for_selector('.hero')
    def tearDown(self):
        try:self.assertEqual(self.errors,[])
        finally:self.ctx.close()
    def seed(self,s=None):
        self.page.evaluate('(s)=>PTDB.replace(s)',s or fixture())
        self.page.evaluate("month='2026-01';view='home';render()")
        self.page.wait_for_function("document.querySelector('.monthnav').textContent.includes('január')")
    def state(self): return self.page.evaluate('PTDB.state()')
    def nav(self,view):
        self.page.evaluate('(v)=>go(v)',view)
        self.page.wait_for_function('(v)=>view===v',arg=view)
    def submit(self):self.page.locator('#editForm button[type=submit]').click()
    def wait_close(self):self.page.wait_for_selector('#dialog',state='detached')
    def test_01_full_UI_settings_member_fee_payment_edit_void_restore(self):
        p=self.page
        p.get_by_role('button',name='Beállítások',exact=True).click();p.locator('#startMonth').fill('2026-01');p.locator('#bandName').fill('Zenekar');p.get_by_role('button',name='Beállítások mentése',exact=True).click()
        p.wait_for_function("document.querySelector('#startMonth').value==='2026-01'")
        p.get_by_role('button',name='＋ Díjváltozás felvétele',exact=True).click();p.locator('#fstart').fill('2026-01');p.locator('#famount').fill('10000');self.submit();self.wait_close()
        self.nav('members');p.get_by_role('button',name='＋ Új tag',exact=True).click();p.locator('#fname').fill('Teszt Anna');p.locator('#fstart').fill('2026-01');self.submit();self.wait_close()
        self.nav('home');p.get_by_role('button',name='＋ Új befizetés',exact=True).click();p.locator('#famount').fill('15000');p.locator('#fdate').fill('2026-01-05');self.submit();self.wait_close()
        s=self.state();self.assertEqual(len(s['members']),1);self.assertEqual(len(s['membershipPeriods']),1);self.assertEqual(s['payments'][0]['amount'],15000)
        pid=s['payments'][0]['id'];mid=s['members'][0]['id']
        p.evaluate('([m,id])=>paymentDialog(m,id)',[mid,pid]);p.locator('#famount').fill('20000');self.submit();self.wait_close()
        p.evaluate('(id)=>voidDialog("payments",id)',pid);p.locator('#confirmVoid').click();self.wait_close();self.assertTrue(self.state()['payments'][0]['voided'])
        p.evaluate('(id)=>voidDialog("payments",id)',pid);p.locator('#confirmVoid').click();self.wait_close();self.assertFalse(self.state()['payments'][0]['voided'])
        kinds=[x['kind'] for x in self.state()['auditLog']];self.assertIn('void',kinds);self.assertIn('restore',kinds)
    def test_02_refund_conflict_is_atomic_and_audited(self):
        s=fixture();s['payments']=[payment()];self.seed(s);p=self.page
        p.evaluate("refundDialog('m0')");p.locator('#famount').fill('15000');p.locator('#fdate').fill('2026-01-20');self.submit();self.wait_close()
        before=self.state();p.evaluate("paymentDialog('m0','p')");p.locator('#famount').fill('20000');self.submit();p.wait_for_function("document.querySelector('#toast').textContent.includes('ütközés')")
        self.assertEqual(self.state(),before);self.assertEqual(len(before['refunds']),1)
    def test_03_concurrent_refunds_only_one_commits(self):
        s=fixture();s['payments']=[payment()];self.seed(s)
        statuses=self.page.evaluate('''async()=>{
          const make=id=>({table:'refunds',record:{id,memberId:'m0',amount:15000,date:'2026-01-20',note:'',voided:false},kind:'create',before:null});
          return (await Promise.allSettled([PTDB.commit([make('r1')]),PTDB.commit([make('r2')])])).map(x=>x.status);
        }''')
        self.assertEqual(sorted(statuses),['fulfilled','rejected']);s=self.state();self.assertEqual(len(s['refunds']),1)
        self.assertEqual(len([l for l in s['auditLog'] if l['table']=='refunds']),1)
    def test_04_stale_edit_in_second_tab_rejected(self):
        s=fixture();s['payments']=[payment()];self.seed(s)
        other=self.ctx.new_page();other.goto(URL);other.wait_for_selector('.hero')
        other.evaluate("paymentDialog('m0','p')");other.wait_for_selector('#editForm');other.locator('#famount').fill('40000')
        self.page.evaluate("p=>PTDB.commit([{table:'payments',record:{...p,amount:50000},before:p}])",payment())
        other.locator('#editForm button[type=submit]').click();other.wait_for_function("document.querySelector('#toast').textContent.includes('közben megváltozott')")
        self.assertEqual(self.state()['payments'][0]['amount'],50000);other.close()
    def test_05_restore_valid_file_and_audit_preservation(self):
        self.seed();s=fixture();s['payments']=[payment()];s['auditLog']=[{'id':'old-log','at':'2026-01-05T10:00:00.000Z','table':'payments','recordId':'p','kind':'create','before':None,'after':payment()}]
        text=json.dumps({'format':'probaterem-backup','version':2,'created':'2026-02-01T10:00:00.000Z','tables':s},ensure_ascii=False)
        p=self.page;p.evaluate('restoreDialog()');p.locator('#restoreFile').set_input_files({'name':'valid.json','mimeType':'application/json','buffer':text.encode()});p.locator('#restoreConfirm').click();self.wait_close()
        result=self.state();self.assertEqual(result['payments'],s['payments']);self.assertIn('old-log',[l['id'] for l in result['auditLog']]);self.assertIn('restore-database',[l['kind'] for l in result['auditLog']])
        p.evaluate('safetyDialog()');p.wait_for_selector('[data-safety]');self.assertGreater(p.locator('[data-safety]').count(),0)
    def test_06_bad_imports_do_not_change_database(self):
        self.seed();before=self.state()
        samples=['{broken',json.dumps({'format':'probaterem-backup','version':99,'created':'2026-01-01T00:00:00Z','tables':fixture()})]
        for change in [lambda s:s.pop('payments'),lambda s:s['members'][0].update(name={}),lambda s:s['rentalFees'][0].update(start='2026-99'),lambda s:s['membershipPeriods'][0].update(memberId='missing'),lambda s:s['landlordPayments'].append({'id':'owner','month':'2026-01','paid':True,'date':'invalid','amount':10})]:
            s=fixture();change(s);samples.append(json.dumps({'format':'probaterem-backup','version':2,'created':'2026-01-01T00:00:00Z','tables':s}))
        for text in samples:
            p=self.page;p.evaluate('closeModal();restoreDialog()');p.locator('#restoreFile').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':text.encode()});p.locator('#restoreConfirm').click();p.wait_for_function("document.querySelector('#toast').textContent.startsWith('Visszaállítás sikertelen:')")
            self.assertEqual(self.state(),before)
    def test_07_backup_download_does_not_claim_success(self):
        s=fixture();s['payments']=[payment()];self.seed(s);p=self.page
        p.evaluate('window.showSaveFilePicker=undefined')
        with p.expect_download() as info:p.evaluate('backup()')
        d=info.value;text=Path(d.path()).read_text();obj=json.loads(text);self.assertEqual(obj['version'],2);self.assertEqual(obj['tables'],self.state_before_attempt(s))
        p.wait_for_function("PTDB.state().then(s=>s.backupMetadata.some(x=>x.id==='lastAttempt'))")
        self.assertFalse(any(x['id']=='last' for x in self.state()['backupMetadata']))
        self.assertGreater(p.locator('#backupNotice').count(),0)
    def state_before_attempt(self,s):
        # PTDB.replace adds a restore audit; compare to downloaded current pre-attempt state.
        current=self.state();current['backupMetadata']=[x for x in current['backupMetadata'] if x['id']!='lastAttempt'];return current
    def test_08_file_writer_success_and_cancel_branches_simulated(self):
        self.seed();p=self.page
        p.evaluate('''window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async text=>{window.savedBackup=text},close:async()=>{window.closedBackup=true},abort:async()=>{}})})''')
        p.evaluate('backup()');p.wait_for_function("PTDB.state().then(s=>s.backupMetadata.some(x=>x.id==='last'))")
        self.assertTrue(p.evaluate('window.closedBackup'));self.assertEqual(json.loads(p.evaluate('window.savedBackup'))['version'],2)
        before=self.state();p.evaluate("()=>{window.showSaveFilePicker=async()=>{throw new DOMException('cancelled','AbortError')}}");p.evaluate('backup()');self.assertEqual(self.state(),before)
    def test_09_xlsx_and_print_PDF_all_three_reports(self):
        demo=json.loads((ROOT/'demo/demo-adatok.json').read_text())['tables'];self.seed(demo);p=self.page
        for kind in ['summary','period','ledger']:
            self.nav('reports');p.wait_for_selector('#reportType');p.locator('#reportType').select_option(kind)
            if kind=='summary':p.locator('#rmonth').fill('2026-01')
            else:p.locator('#rfrom').fill('2026-01');p.locator('#rto').fill('2026-04')
            expected=p.evaluate('async()=>reportData(await PTDB.state())')
            with p.expect_download() as info:p.get_by_role('button',name='⬇ Excel (.xlsx)',exact=True).click()
            data=Path(info.value.path()).read_bytes();(ARTIFACTS/f'{kind}.xlsx').write_bytes(data)
            wb=openpyxl.load_workbook(io.BytesIO(data));actual=list(wb.worksheets[0].values)[5:];self.assertEqual([list(r) for r in actual],[expected['headers']]+expected['rows'])
            # Numeric monetary cells and independent supplemental data readback.
            notes=list(wb.worksheets[1].values)[1:];self.assertEqual([list(r) for r in notes],expected['extra'])
            p.get_by_role('button',name='▤ PDF',exact=True).click();p.wait_for_selector('.reportprint')
            actual_rows=p.locator('.reportprint table').first.locator('tbody tr').evaluate_all('(rows)=>rows.map(r=>[...r.cells].map(c=>c.textContent))');self.assertEqual(actual_rows,[[str(cell) for cell in row] for row in expected['rows']])
            pdf=ARTIFACTS/f'{kind}.pdf';p.pdf(path=str(pdf),format='A4',print_background=True)
            pdf_text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-']).decode()
            self.assertIn('Demózenekar',pdf_text);self.assertIn(expected['title'],pdf_text);self.assertIn('Kovács Anna',pdf_text)
            for r in expected['rows']:
                for cell in r:
                    if isinstance(cell,(int,float)):self.assertIn(str(cell),pdf_text)
            p.get_by_role('button',name='Vissza az alkalmazáshoz',exact=True).click()
    def test_10_mobile_sizes_large_amounts_long_names_no_page_overflow(self):
        s=fixture();s['members'][0]['name']='Hosszú magyar ékezetes zenekari tagnév – Árvíztűrő Tükörfúrógép';s['rentalFees'][0]['amount']=1000000000;self.seed(s);p=self.page
        for width in [360,390,430]:
            p.set_viewport_size({'width':width,'height':800})
            for v in ['home','members','ledger','settings','reports','detail']:
                p.evaluate("memberId='m0'");self.nav(v);p.wait_for_timeout(60)
                self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'{width} {v}')
                sizes=p.locator('button:visible').evaluate_all('(ns)=>ns.map(n=>n.getBoundingClientRect().height)');self.assertTrue(all(x>=44 for x in sizes),(width,v,sizes))
            self.nav('home');p.wait_for_selector('.hero');p.screenshot(path=str(ARTIFACTS/f'mobile-{width}.png'),full_page=True)
        p.evaluate("paymentDialog('m0')");p.wait_for_selector('#famount');p.locator('#fnote').focus();p.keyboard.press('Escape');self.wait_close()
    def test_11_offline_reload_and_financial_operation(self):
        self.seed();p=self.page;p.evaluate('navigator.serviceWorker.ready');p.wait_for_function('navigator.serviceWorker.controller!==null')
        self.ctx.set_offline(True);p.reload();p.wait_for_selector('.hero');self.assertIn('Offline mód',p.locator('#runtimeStatus').inner_text())
        p.get_by_role('button',name='＋ Új befizetés',exact=True).click();p.locator('#famount').fill('10000');p.locator('#fdate').fill('2026-01-15');self.submit();self.wait_close();self.assertEqual(self.state()['payments'][0]['amount'],10000)
        self.ctx.set_offline(False)
    def test_12_service_worker_preserves_other_apps_cache(self):
        p=self.page;p.evaluate("caches.open('other-app-important').then(c=>c.put('/unrelated',new Response('keep')))")
        p.evaluate('navigator.serviceWorker.ready');p.wait_for_function('navigator.serviceWorker.controller!==null')
        self.assertTrue(p.evaluate("caches.has('other-app-important')"))
        self.assertEqual(p.evaluate("caches.open('other-app-important').then(c=>c.match('/unrelated')).then(r=>r.text())"),'keep')
    def test_13_versioned_local_migration_retains_original_and_safety_snapshot(self):
        p=self.page;old=fixture();old['backupMetadata']=[{'id':'last','value':'2026-01-01T00:00:00.000Z'}];old['payments']=[payment()]
        # Write an authentic 1.0-shaped database using native IndexedDB, then reload 1.1.
        p.evaluate('''s=>new Promise((res,rej)=>{const r=indexedDB.open('probaterem-db',1);r.onsuccess=()=>{const d=r.result,tx=d.transaction(PT.TABLES,'readwrite');for(const t of PT.TABLES){tx.objectStore(t).clear();for(const x of s[t])tx.objectStore(t).put(x);}tx.oncomplete=()=>{d.close();res()};tx.onerror=()=>rej(tx.error);};})''',old)
        p.reload();p.wait_for_selector('.hero');s=self.state();self.assertEqual(s['payments'],old['payments']);self.assertEqual(s['members'],old['members']);self.assertFalse(any(x['id']=='last' for x in s['backupMetadata']));self.assertTrue(any(x['kind']=='migrate-1.0-to-1.1' for x in s['auditLog']))
        p.evaluate('safetyDialog()');p.wait_for_selector('[data-safety]')
        with p.expect_download() as info:p.locator('[data-safety]').first.click()
        restored=json.loads(Path(info.value.path()).read_text());self.assertEqual(restored['tables'],old)
    def test_14_landlord_UI_and_fee_difference(self):
        self.seed();p=self.page;p.evaluate('ownerDialog()');p.locator('#paid').check();p.locator('#fdate').fill('2026-01-20');p.locator('#famount').fill('10000');self.submit();self.wait_close()
        p.evaluate("feeDialog('fee')");p.locator('#famount').fill('12000');self.submit();self.wait_close();p.wait_for_function("document.querySelector('#app').textContent.includes('Eltérés:')");self.assertEqual(self.state()['landlordPayments'][0]['amount'],10000)
        p.evaluate('ownerDialog()');p.locator('#paid').uncheck();self.submit();self.wait_close();self.assertFalse(self.state()['landlordPayments'][0]['paid'])
    def test_15_membership_return_and_overlap_UI(self):
        self.seed();p=self.page;p.evaluate("editPeriod('m0','period')");p.locator('#pend').fill('2026-02');self.submit();self.wait_close()
        p.evaluate("editPeriod('m0')");p.locator('#pstart').fill('2026-04');self.submit();self.wait_close();self.assertEqual(len(self.state()['membershipPeriods']),2)
        before=self.state();p.evaluate("editPeriod('m0')");p.locator('#pstart').fill('2026-01');self.submit();p.wait_for_function("document.querySelector('#toast').textContent.includes('Átfedő')");self.assertEqual(self.state(),before)
    def test_16_ledger_date_and_member_filter(self):
        s=fixture();s['payments']=[payment(id='jan'),payment(id='feb',date='2026-02-05')];self.seed(s);self.nav('ledger');p=self.page;p.wait_for_selector('#ledgerFrom');p.locator('#ledgerFrom').fill('2026-02-01');p.locator('#ledgerTo').fill('2026-02-28');p.locator('#ledgerTo').blur();self.assertEqual(p.locator('#ledgerRows [data-member]:visible').count(),1);self.assertIn('feb',p.locator('#ledgerRows [data-member]:visible').inner_text())
    def test_17_reminder_snooze_seven_days(self):
        self.seed();p=self.page;self.assertEqual(p.locator('#backupNotice').count(),1);p.locator('#snoozeBackup').click();p.wait_for_selector('#backupNotice',state='detached');self.assertTrue(any(x['id']=='snooze' for x in self.state()['backupMetadata']));p.reload();p.wait_for_selector('.hero');self.assertEqual(p.locator('#backupNotice').count(),0)
    def test_18_double_submit_creates_one_payment(self):
        self.seed();p=self.page;p.evaluate("paymentDialog('m0')");p.locator('#famount').fill('10000');p.locator('#fdate').fill('2026-01-15');p.evaluate("document.querySelector('#editForm').requestSubmit();document.querySelector('#editForm').requestSubmit()");self.wait_close();self.assertEqual(len(self.state()['payments']),1)

    def test_19_service_worker_update_preserves_data(self):
        # Real service-worker lifecycle with two cache versions, isolated hosting directory.
        with tempfile.TemporaryDirectory() as td:
            base=Path(td)
            for f in ROOT.iterdir():
                if f.is_file():shutil.copyfile(f,base/f.name)
            old_worker=(base/'sw.js').read_text().replace('"1.1.0"', '"test-previous"')
            (base/'sw.js').write_text(old_worker)
            server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=td))
            threading.Thread(target=server.serve_forever,daemon=True).start()
            url=f'http://127.0.0.1:{server.server_port}/'
            ctx=self.browser.new_context(timezone_id='Europe/Budapest')
            try:
                page=ctx.new_page();page.goto(url);page.wait_for_selector('.hero');page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller!==null')
                original=fixture();original['payments']=[payment()];page.evaluate('s=>PTDB.replace(s)',original);before=page.evaluate('PTDB.state()')
                (base/'sw.js').write_text((ROOT/'sw.js').read_text())
                # Force a different mtime beyond the HTTP date granularity; no sleeps.
                stat=(base/'sw.js').stat();os.utime(base/'sw.js',(stat.st_atime,stat.st_mtime+5))
                page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
                page.wait_for_function('swRegistration && swRegistration.waiting!==null')
                page.get_by_role('button',name='Frissítés betöltése',exact=True).click()
                page.wait_for_selector('.hero');page.wait_for_function('navigator.serviceWorker.controller!==null')
                self.assertEqual(page.evaluate('PTDB.state()'),before)
                keys=page.evaluate('caches.keys()');self.assertFalse(any('test-previous' in k for k in keys));self.assertTrue(any('1.1.0' in k for k in keys))
                ctx.set_offline(True);page.reload();page.wait_for_selector('.hero');self.assertEqual(page.evaluate('PTDB.state()'),before)
            finally:ctx.close();server.shutdown();server.server_close()
    def test_20_real_IndexedDB_abort_rolls_back_payment_and_log(self):
        self.seed();p=self.page;before=self.state();existing=before['auditLog'][0]['id']
        error=p.evaluate("""async existing=>{
          const original=crypto.randomUUID.bind(crypto);crypto.randomUUID=()=>existing;
          try{await PTDB.commit([{table:'payments',record:{id:'new-payment',memberId:'m0',amount:100,date:'2026-01-05',voided:false,note:''},kind:'create',before:null}]);return 'unexpected success';}
          catch(e){return e.name;}finally{crypto.randomUUID=original;}
        }""",existing)
        self.assertEqual(error,'ConstraintError');self.assertEqual(self.state(),before)
    def test_21_file_writer_failure_does_not_mark_backup(self):
        self.seed();p=self.page;before=self.state()
        p.evaluate("""()=>{window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{throw Error('simulated disk failure')},abort:async()=>{}})})}""")
        p.evaluate('backup()');p.wait_for_function("document.querySelector('#toast').textContent.includes('simulated disk failure')")
        self.assertEqual(self.state(),before)

    def test_22_actual_1_0_service_worker_and_database_upgrade(self):
        with tempfile.TemporaryDirectory() as td:
            with zipfile.ZipFile(ROOT/'tests/fixtures/original-1.0.zip') as z:z.extractall(td)
            base=Path(td)/'probaterem-app'
            server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(base)))
            threading.Thread(target=server.serve_forever,daemon=True).start()
            url=f'http://127.0.0.1:{server.server_port}/'
            ctx=self.browser.new_context(timezone_id='UTC')
            try:
                page=ctx.new_page();page.goto(url);page.wait_for_selector('.hero');page.evaluate('navigator.serviceWorker.ready');page.wait_for_function('navigator.serviceWorker.controller!==null')
                old=fixture();old['backupMetadata']=[{'id':'last','value':'2026-01-01T00:00:00.000Z'}];old['payments']=[payment()]
                page.evaluate("""s=>new Promise((res,rej)=>{const r=indexedDB.open('probaterem-db',1);r.onsuccess=()=>{const d=r.result,tx=d.transaction(Object.keys(s),'readwrite');for(const t of Object.keys(s)){tx.objectStore(t).clear();for(const x of s[t])tx.objectStore(t).put(x);}tx.oncomplete=()=>{d.close();res()};tx.onerror=e=>rej(e.target.error);};})""",old)
                # Same real origin + path, real 1.0 cache and IndexedDB; replace hosted files.
                for f in ROOT.iterdir():
                    if f.is_file():shutil.copyfile(f,base/f.name)
                stat=(base/'sw.js').stat();os.utime(base/'sw.js',(stat.st_atime,stat.st_mtime+5))
                with ctx.expect_event('serviceworker') as event:
                    page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();}')
                worker=event.value
                page.wait_for_function('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)')
                page.close()  # README: close every old app tab; old 1.0 has no update button.
                deadline=time.monotonic()+10
                while not worker.evaluate("self.registration.waiting===null&&self.registration.active?.state==='activated'"):
                    if time.monotonic()>deadline:self.fail('1.1 worker did not activate after closing 1.0')
                    time.sleep(.05)
                page=ctx.new_page();page.goto(url);page.wait_for_selector('.hero');page.wait_for_function("typeof PTDB!=='undefined'")
                after=page.evaluate('PTDB.state()');self.assertEqual(after['payments'],old['payments']);self.assertEqual(after['members'],old['members']);self.assertTrue(any(x['kind']=='migrate-1.0-to-1.1' for x in after['auditLog']))
                self.assertEqual(page.evaluate("async()=>PT.balanceAt(await PTDB.state(),'m0','2026-01')"),20000)
                ctx.set_offline(True);page.reload();page.wait_for_selector('.hero');self.assertEqual(page.evaluate('PTDB.state()'),after)
            finally:ctx.close();server.shutdown();server.server_close()

if __name__=='__main__': unittest.main(verbosity=2)
