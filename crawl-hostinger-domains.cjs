const https = require('https');

// List of tracker domains
const trackerDomains = `
1l-go.my.games
2performant.com
fff.com.vn
t.6sc.co
rcv.ixd.dmm.co.jp
clt.johren.net
clt.ixd.dmm.co.jp
clt.johren.games
rcv.johren.net
rcv.ixd.dmm.com
clt.ixd.dmm.com
rcv.johren.games
ac.ebis.ne.jp
track.adsplay.in
cl.adsever.in
aiotrack.org
ai-track.net
ai-trk.com
cl4.andromobi.com
cl1.andromobi.com
cl5.andromobi.com
cl3.andromobi.com
click.andromobi.com
cl2.andromobi.com
ads.ads-astra.com
adition.com
mememasti.com
bulletinweb.com
khelgali.com
breaknewz.com
techtubebox.com
crickcounty.com
travellercounty.com
adaxxcloud.com
ab-x.link
ap1.adtouch.dfinery.io
adtouch.adbrix.io
t.adcell.com
addrevenue.io
adflowtracker.com
adform.net
adform.com
seadform.net
adjust.com
adlucent.com
ad.admitad.com
tjzuh.com
unileverbrazil.demdex.net
unilever3.demdex.net
unilever2.demdex.net
unilever.demdex.net
pixel.everesttech.net
sync-tm.everesttech.net
click.adora-ai.com
cl.adosiz.net
adosiz.io
ad.adpump.com
adsplusmetrics.com
trackwithadsplus.com
adsplustracker.com
adsplusgrowth.com
track2.adsdolfin.com
track.adsdolfin.com
track1.adsdolf.in
track.adsdolf.in
track2.adsdolf.in
track4.adsdolfin.com
track4.adsdolf.in
track3.adsdolfin.com
track1.adsdolfin.com
track5.adsdolfin.com
track3.adsdolf.in
track5.adsdolf.in
track.adtraction.com
ad.adverticum.net
jump.votuya.com
jump.yqnurg.com
jump.penziu.com
jump.soesii.com
awmonitor.com
track.adzflyer.com
aff44.com
affiliate44.com
mtrid.com
tracking24x7.com
linkstrackar.com
trk.affapp.io
scripts.affiliatefuture.com
tracking.affiliateport.eu
awin1.com
banners.netbet.gr
ct.paidmediatrk.com
affilired.com
trk.g4trk.com
trk.affattr.com
trk.affattr1.com
takmertok.com
tracker.offersfollow.com
trk010.gaftrad.com
trk007.goaftrad.com
trk008.gaftrad.com
trk002.goaftrad.com
trk004.gaftrad.com
trk010.goaftrad.com
trk001.gaftrad.com
gaftrad.com
trk006.goaftrad.com
trk009.goaftrad.com
trk003.gaftrad.com
trk007.gaftrad.com
trk005.gaftrad.com
trk008.goaftrad.com
trk005.goaftrad.com
trk002.gaftrad.com
trk009.gaftrad.com
trk001.goaftrad.com
goaftrad.com
trk003.goaftrad.com
trk004.goaftrad.com
trk006.gaftrad.com
d.agkn.com
abr.ge
deeplink.page
alphabyte.co.in
trkjkamaret.com
amazon-adsystem.com
amazon-value-service.com
click.appcast.io
onelnk.com
onelink.me
engagements.appsflyer.com
app.appsflyer.com
appstack.link
aiproxies.com
ew3.io
penta.a.one.impact-ad.jp
router.geeklab.app
globalclicklab.com
awebopt.com
clickserv.sitescout.com
beacon.bcn.to
luna.r.lafamo.com
pluto.r.powuta.com
janus.r.jakuli.com
neso.r.niwepa.com
atlas.r.akipam.com
x.bndspn.com
bndspn.com
tracker.blend-ai.com
bluems.com
bluekai.com
app.link
cjads.com
cpvtrk.com
cpvcld.com
trk.rdrclp.com
trk.clptrk.com
link.crosswayrocks.com
lnk1.crosswayrocks.com
lnk4.crosswayrocks.com
lnk2.crosswayrocks.com
lnk5.crossway.rocks
lnk5.crosswayrocks.com
lnk3.crosswayrocks.com
link.crossway.rocks
lnk2.crossway.rocks
lnk1.crossway.rocks
lnk4.crossway.rocks
lnk3.crossway.rocks
ad.doubleclick.net
cptrack.de
click.channelsight.com
trkn.us
arttrk.com
admd.ink
spxl.ink
botman.ninja
fst.ink
linkcenter.derbysoftca.com
click.deepmindz.co
clickcease.com
clickexpose.com
tracker.clickfortify.com
clckptrl.com
clck-001.clickpatrol.com
ping.clicksambo.com
clickdefense.cc
pulse.clickguard.com
tracker.clickguard.com
io.clickguard.com
clicksbuster.com
t.clickwise.net
tracker.clixtell.com
securewebmetrics.com
userlinx.com
auth-analytix.com
trkrcc.com
trackercc.com
secwebmetrics.com
usrlnx.com
auth-analytics.com
commander1.com
t.cfjump.com
cadsutb.net
rd.bizrate.com
contextweb.com
mediaplex.com
mobcs.com
whoozy.com
creatorsmob.co
trk.concthub.com
trk.flexitrck.com
trk.grdhub.com
trk.effiflw.com
trk.innodsk.com
trk.wavezw.com
trk.vibebusi.com
trk.outbizz.com
trk.zaptk.com
tk.dsptmedia.com
trk.jetstrms.com
crealytics.com
trkccgl.com
linksredirect.com
lnks.co.in
book-secure.com
secure-hotel-booking.com
d-edgeconnect.media
day24.online
pla.daisycon.io
gotravelholidays.com
impulseonline.shop
adx.io
tracking.delupe.net
lnk.demandesk.com
amnet.tw
trackeame.com
go.dognet.com
drivemetadata.io
dmd.mobi
media01.eu
eat.emmasolutions.net
eacdn.com
eonlnm.com
eonlnx.com
eonlnv.com
eonlnq.com
affilmanage.com
etracker.de
gametlk1.com
gametlk3.com
gametlk2.com
gfl85trk.com
ib0ftrk.com
exactag.com
tracker.internet24marketing.com
tracker.secretdealstoday.com
track.addtocart.today
fms.zopoyo.com
c.neqty.net
servedby-us.flashtalking.com
servedby.flashtalking.com
monitor.fraudblocker.com
click-eu.fraud0.net
click.fraud0.io
click.fraud0.com
click.fraud0.net
trck.fttrck.net
gsght.com
trk.genieshopping.com
trk2.genieshopping.com
clicktracker.getblue.io
l.glitch.fun
globerada.com
tracking.globerada.com
trk.globerada.com
tracker.glopss.com
go.gomobupps.com
link.mobupps.com
aumtrack.com
track.hausbyra.eu
a.nonstoppartner.net
click.hitprobe.com
go.hotmart.com
c.hubz.pl
blissoffer.com
ck.hdm3.in
cdn.adsdefender.com
ssl.hurra.com
trk.trktrackier.com
trk.ibratrk.com
t.dawin.tv
clk.im-apps.net
system360.inistrack.net
google.itgreen.com.vn
itgreen.com.vn
pxf.io
sjv.io
iljmp.com
aclk.org
7-aclk.net
5-aclk.net
1-aclk.net
bidminer.com
8-aclk.net
9-aclk.net
3-aclk.net
2-aclk.net
4-aclk.net
6-aclk.net
rubsy.ingenious.cloud
intelliad.de
track.iktrack.com
click.advertisemedia.pro
kelkoogroup.net
k.keyade.com
mt-k.madmetrics.com
k.madmetrics.com
sv.brand-display.com
adsmeasurement.com
smart.link
control.kochava.com
koddi.com
track.izhuama.com
track.linkbest.com
magnetise.io
leadintel.io
go.leadgid.com
go.leadgid.eu
track.leandigitalmedia.com
adsv.svc.litv.tv
pixel.ad.lifesight.io
linkconnector.com
go.linkwi.se
betfirst.livepartners.com
777es.livepartners.com
netbetit.livepartners.com
777nl.livepartners.com
netbetfr.livepartners.com
777be.livepartners.com
netbet.livepartners.com
777ch.livepartners.com
banners.livepartners.com
lndata.com
myplumber.co
attorneyandlegal.com
realestatesrvs.com
homeresource.online
localrl.com.au
homesrvcs.com
localrl.com
dentalservices.biz
purchasenow.us
smrtlnk.com
autorl.parts
legalservices.help
homerl.services
healthresources.co
localbusinesses.services
services.dental
reachlocal.com
rtrk.co.nz
rtrk.co.uk
rtrk.com.au
rtrk.com
rtrk.ca
professionalsrvcs.com
localservicerl.com.au
reservationnow.us
localbusuiness.com
autopurchase.us
construccionrl.com
healthservices.help
acandheating.co
homeservices.company
healthservicesrl.com.au
automotive.services
shopnearme.us
autoresource.online
findschools.ca
rtrk5.com
learning.school
personalservices.biz
localhomeservices.biz
bcp.crwdcntrl.net
autos.lotlinx.com
ppcprotect.com
lunio.ai
tracker.miccreative.vn
clk.simulation-technology.com
trace.marketingviadigital.com
flexctk.com
linknhanh.org
afflat3s3.com
afflat3s2.com
afflat3s1.com
afflat3x.com
mcclk.com
click.maxconv.com
track.maxpointmedia.com
url.link
verify.link
go.media.net
launch.link
medialead.de
mathtag.com
mediascopy.com
media-box.co.in
adworks-media.com
ad-zilla.com
mediazotic.net
o-s.io
app.metricsverse.com
eclicktracker.fr
mino.org
minotracker.com
mobiotud.com
mobiotsd.com
mobiothd.com
wetrack.online
muypil.com
us-serve.nrich.ai
serve.nrich.ai
trk.nomadzdigital.com
t.neory-tm.net
neural17.cdnwebcloud.com
nwzo.io
c.nexinsight.com.ua
nextleveldefend.com
worx.io
myvisualiq.net
fcd.autoads.asia
autoads.asia
mmtro.com
hermesad.deltaverse-intl.com
faix.levelinfinite.com
track.aix.levelinfinite.com
t5.offerrobo.com
t3.go2robo.com
t1.offerrobo.com
t2.offerrobo.com
go2robo.com
t3.offerrobo.com
t4.offerrobo.in
t4.go2robo.com
t2.offerrobo.in
t4.offerrobo.com
t1.offerrobo.in
t5.go2robo.com
t5.offerrobo.in
t2.go2robo.com
t1.go2robo.com
t3.offerrobo.in
track.clicks18.com
trk.oneklix.com
opticksprotection.com
track.omguk.com
tds.pdl-profit.com
ppcshield.io
ppcsecure.com
prf.hn
pmrevo.com
pmcloud1.com
clearpmf.com
phoenixads.net
pixamz.com
lms.pixeltrack.co.in
placed.com
gethatch.com
gc2.proffcus.com
gc8.g2prof.net
gc4.proffcus.in
gc.g2prof.net
gc7.g2prof.net
gc1.proffcus.in
gc3.proffcus.com
gc.proffcus.com
gc4.proffcus.com
gc2.proffcus.in
gc.proffcus.in
gc9.g2prof.net
gc2.g2prof.net
gc6.g2prof.net
gc3.proffcus.in
gc1.g2prof.net
gc3.g2prof.net
g2prof.net
gc4.g2prof.net
gc5.g2prof.net
gc1.proffcus.com
gc5.proffcus.in
gc5.proffcus.com
gc10.g2prof.net
profitshare.bg
l.profitshare.ro
propelbon.com
track.prudigital.in
staticiv.com
tracker.quartileattribution.com
mabelle.retchat.com
click.trackingadz.com
tracking.raffesia.com
grp08.ias.rakuten.co.jp
affiliate.api.rakuten.com.tw
r.insd.co
ravn.click
jsv3.recruitics.com
click.redbrain.com
click2.redbrain.com
retads.net
ads.revjet.com
xprrtupdate.com
oc.sparkasse.de
d.hodes.com
tr.slvrbullet.com
00px.net
api.sg.sadangattribution.com
safeads.com.br
trackingsafeads.com
sdprl.com
krxd.net
adtrackgate.com
track-gads.com
adlinkrouter.com
tracking.sam-media.com
clickserve.dartsearch.net
searchpad.com
s.trcks2s.com
srvto.com
shareasale.com
shareasale-analytics.com
linksshift.com
shareaprofit.com
linkspasson.com
linkmybrand.com
sfanalyse.com
tracker.shoparize.com
trk.shopello.se
shopping-feed.com
v.short.gy
transparentlink.co
click.singoo.cc
sng.link
track.mfilter.net
trk.mfilterit.net
pass.mfilterit.net
clk.mfilterit.net
click.mfilter.net
clk.mfilter.net
xg4ken.com
smartmailboost.com
clickfrauddefender.com
receive-us.solar-engine.io
eu.sp-trk.com
sp-trk.com
trackerjourney.com
stendia.co.uk
superpages.com
gswaarm.com
gtrcking.com
track.sync.deals
adnt.lesta.ru
cltr.lesta.ru
clck.lesta.ru
red.lesta.ru
rdr.lesta.ru
redir.lesta.ru
clc.lesta.ru
adn.lesta.ru
clk.lesta.ru
cpm.lesta.ru
trck.lesta.ru
redir.wargaming.net
clk.wargaming.net
cltr.wargaming.net
clc.wargaming.net
clck.wargaming.net
rdr.wargaming.net
trck.wargaming.net
adnt.wargaming.net
red.wargaming.net
adn.wargaming.net
cpm.wargaming.net
onboard.triptease.io
go2jump.org
go2cloud.org
tailtarget.com
tatrck.com
tapper.ai
track.tenjin.io
track.tenjin.com
glnk.me
redirect.tracify.ai
trkdsk.com
gotrackier.com
click.trackier.io
t.amobeez.com
trackerrs.com
trackerspath.com
trakerrs.com
trackony.com
gads.tradedoubler.com
track.trafficguard.ai
traffic-man.com
godev.trakaff.net
iaurl.io
1aurl.net
aclk.co
aclk.io
1aurl.io
tracking.tracktolast.com
tracking.minetracking.com
tracking.trucliks.com
tracking.nextotrack.com
affds3.com
affds1.com
affds2.com
trk.grmcart.com
c.inrasx.com
click.juyyba.com
r.hosvuy.com
trakr.ivuzus.com
rdt.hosmeo.com
tracker.vaudit.com
vaudit.com
insurancedray.com
retagos.com
clicksmedias.com
voltagesearch.com
gct.dashboard.wedare.pl
track.webgains.com
assets.ikhnaie.link
weborama.fr
priceza.com
analytics-prd.aws.wehaa.net
swagtrk.com
trk.wewotrk.com
s1.whistleloop.com
yellowbook.com
yytrxgenz.com
tt.ggtefns.com
trxevlink.com
yytrxgenc.com
introyygg.com
ggtefns.com
yytrxgenb.com
remarktag.com
t.afi-b.com
tm.simptrack.com
tm.attrxs.de
bdash-tracking.com
attribution.uk.customer360.co
attribution.usa.customer360.co
uintertool.com
uinterbox.com
trck.easy-m.de
nextag.de
i.ipromote.com
t.trkhoop.com
mediaintelligence.de
audience-api.wts-okube.com
cmodul.solutenetwork.com
tr.threeate.jp
tracker.urgya.com
tracker.ysnib.com
tracker.vigiqe.com
tracker.vuivy.com
tracker.vuijia.com
serve.wigolg.com
tracker.unuves.com
serve.ytlyng.com
tracker.qywube.com
tracker.ylsorg.com
smartclkdms.com
clkdms.com
ecomclk.com
ecomdmsclk.com
clickecomdms.com
crm-measure.com
`;

// Extract root domain
function extractRootDomain(domain) {
  const parts = domain.trim().split('.');
  
  const specialTLDs = [
    '.co.uk', '.co.jp', '.co.in', '.co.nz', '.co.au', 
    '.com.au', '.com.br', '.com.tw', '.com.vn',
    '.ne.jp', '.or.jp'
  ];
  
  const domainStr = '.' + domain;
  for (const tld of specialTLDs) {
    if (domainStr.endsWith(tld)) {
      const tldParts = tld.split('.').filter(p => p);
      return parts.slice(-(tldParts.length + 1)).join('.');
    }
  }
  
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  
  return domain;
}

const allDomains = trackerDomains.split('\n')
  .map(d => d.trim())
  .filter(d => d.length > 0);

const rootDomains = [...new Set(allDomains.map(extractRootDomain))];

console.log(`\n🔍 Found ${rootDomains.length} unique root domains\n`);

// Fetch webpage and check if domain is available
function checkDomainOnHostinger(domainName) {
  return new Promise((resolve, reject) => {
    const url = `https://www.hostinger.com/domain-name-results?from=domain-name-search&domain=${encodeURIComponent(domainName)}`;
    
    const options = {
      hostname: 'www.hostinger.com',
      path: `/domain-name-results?from=domain-name-search&domain=${encodeURIComponent(domainName)}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          // Check if the exact domain with its TLD appears with a price and "Buy now" button
          // If .com is available, we'll see "domainname.com" with pricing
          // If taken, we'll only see alternative TLDs
          
          const parts = domainName.split('.');
          const tld = parts[parts.length - 1];
          
          // Look for the domain with "Buy now" or price indicators
          // Pattern: domain.tld followed by price like "$ X.XX"
          const availablePattern = new RegExp(`${domainName.replace('.', '\\.')}[\\s\\S]*?\\$\\s*\\d+\\.\\d+.*?Buy now`, 'i');
          const isAvailable = availablePattern.test(data);
          
          // Also check if page shows "unavailable" or only shows alternative domains
          const alternativePattern = new RegExp(`More options[\\s\\S]*?${domainName.split('.')[0]}\\.(?!${tld})`, 'i');
          const hasAlternatives = alternativePattern.test(data);
          
          resolve({
            domain: domainName,
            available: isAvailable,
            hasAlternatives: hasAlternatives,
            html: data.substring(0, 500) // Keep small sample for debugging
          });
        } catch (e) {
          reject({ domain: domainName, error: 'Failed to parse HTML', details: e.message });
        }
      });
    });

    req.on('error', (error) => {
      reject({ domain: domainName, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ domain: domainName, error: 'Request timeout' });
    });

    req.end();
  });
}

// Check all domains with delays
async function checkAllDomains() {
  const results = {
    available: [],
    taken: [],
    errors: []
  };

  console.log('🌐 Crawling Hostinger domain checker...\n');
  console.log(`⏱️  This will take approximately ${Math.ceil(rootDomains.length * 3 / 60)} minutes with 3s delays...\n`);

  for (let i = 0; i < rootDomains.length; i++) {
    const domain = rootDomains[i];
    
    console.log(`[${i+1}/${rootDomains.length}] Checking ${domain}...`);
    
    try {
      const result = await checkDomainOnHostinger(domain);
      
      if (result.available) {
        results.available.push(domain);
        console.log(`✅ ${domain} - AVAILABLE! 💰`);
      } else {
        results.taken.push(domain);
        console.log(`⛔ ${domain} - Taken (alternatives shown: ${result.hasAlternatives})`);
      }
    } catch (err) {
      results.errors.push({ domain: domain, error: err.error || err.details || 'Unknown' });
      console.log(`❌ ${domain} - Error: ${err.error || 'Unknown'}`);
    }
    
    // Wait 3 seconds between requests to be respectful
    if (i < rootDomains.length - 1) {
      console.log('⏳ Waiting 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Available for purchase: ${results.available.length}`);
  console.log(`⛔ Already registered: ${results.taken.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);

  if (results.available.length > 0) {
    console.log('\n🎉 AVAILABLE DOMAINS TO BUY:');
    console.log('='.repeat(60));
    results.available.forEach(domain => {
      console.log(`  • ${domain}`);
    });
  }

  if (results.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    results.errors.forEach(item => {
      console.log(`  • ${item.domain}: ${item.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

// Run the check
checkAllDomains().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
