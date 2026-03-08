import React, { useState, useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { useSolanaPayment, SUPPORTED_TOKENS } from './hooks/useSolanaPayment';
import { supabase } from './supabaseClient';
import DOMPurify from 'dompurify';
import { locales } from './locales';

const TOTAL_TOMBS = 1000; // 40x25 grid

// Kuşbakışı (Top-Down) Somut Mezar ve Lahit Tasarımları (Yeni Model)
const getStoneOptions = (t) => [
  { 
    id: 'classic', 
    label: t.classic, 
    price: '10$',
    icon: (
      // Yukarıdan Görünüm: Klasik Altıgen Tabut (Koyu Gri/Metalik)
      <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <polygon points="30,10 70,10 85,30 65,90 35,90 15,30" fill="#2d3748" stroke="#718096" strokeWidth="3"/>
        <polygon points="38,20 62,20 72,35 60,80 40,80 28,35" fill="#1a202c"/>
        <line x1="50" y1="20" x2="50" y2="80" stroke="#4a5568" strokeWidth="2"/>
        <line x1="28" y1="35" x2="72" y2="35" stroke="#4a5568" strokeWidth="2"/>
        <circle cx="50" cy="50" r="3" fill="#718096" />
      </svg>
    ) 
  },
  { 
    id: 'modern', 
    label: t.modern,
    price: '50$', 
    icon: (
      // Yukarıdan Görünüm: Keskin Hatlı Cam Lahit (Siberpunk Turkuaz / Koyu Lacivert)
      <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="10" width="60" height="80" fill="#0f172a" stroke="#0ea5e9" strokeWidth="2" rx="4"/>
        <line x1="20" y1="25" x2="80" y2="25" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4 2"/>
        <line x1="20" y1="75" x2="80" y2="75" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="4 2"/>
        <rect x="35" y="30" width="30" height="40" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" />
        <circle cx="50" cy="50" r="4" fill="#38bdf8" />
      </svg>
    ) 
  },
  { 
    id: 'antique', 
    label: t.antique, 
    price: '100$',
    icon: (
      // Yukarıdan Görünüm: Yıpranmış / Rünlü Kare Mermer (Mistik Mor Dokunuşlar)
      <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="15" y="15" width="70" height="70" fill="#2d3748" stroke="#805ad5" strokeWidth="2" rx="8"/>
        <path d="M 15 15 L 25 25 M 85 15 L 75 25 M 15 85 L 25 75 M 85 85 L 75 75" stroke="#805ad5" strokeWidth="2"/>
        <rect x="25" y="25" width="50" height="50" fill="#1a202c" />
        <path d="M 50 35 L 50 65 M 40 50 L 60 50" stroke="#d6bcfa" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="50" cy="50" r="2" fill="#2d3748" />
      </svg>
    ) 
  },
  { 
    id: 'monument', 
    label: t.monument, 
    price: '1000$',
    icon: (
      // Yukarıdan Görünüm: 4 Taraflı Kraliyet Anıt Mezarı (Altın Sütunlar ve Ortada Heybetli Lahit)
      <svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="#1a1a1a" stroke="#d4af37" strokeWidth="2"/>
        <circle cx="20" cy="20" r="5" fill="#d4af37"/>
        <circle cx="80" cy="20" r="5" fill="#d4af37"/>
        <circle cx="20" cy="80" r="5" fill="#d4af37"/>
        <circle cx="80" cy="80" r="5" fill="#d4af37"/>
        <rect x="25" y="25" width="50" height="50" fill="#2d2d2d" stroke="#d4af37" strokeWidth="2"/>
        <circle cx="50" cy="50" r="16" fill="#d4af37"/>
        <circle cx="50" cy="50" r="12" fill="#1a1a1a"/>
        <polygon points="50,42 55,48 50,54 45,48" fill="#d4af37"/>
      </svg>
    ) 
  }
];

function Necropolis({ t, publicKey }) {
  const [selectedTomb, setSelectedTomb] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stoneType, setStoneType] = useState('monument'); // Varsayılan olarak anıt
  const [savedTombs, setSavedTombs] = useState({});
  const [formData, setFormData] = useState({ name: '', date: '', desc: '' });
  const [isProcessing, setIsProcessing] = useState(false); // Yeni yüklenme state'i
  const [paymentToken, setPaymentToken] = useState('USDC'); // Token seçim state'i

  const currentStoneOptions = getStoneOptions(t);

  const { processPayment } = useSolanaPayment();

  // Supabase Veritabanından Dolu Mezarları (Salt-Okunur) Çek
  useEffect(() => {
    const fetchTombs = async () => {
      const { data, error } = await supabase
        .from('mezarlar')
        .select('*')
        .eq('is_dolu', true);

      if (error) {
        console.error('Supabase yükleme hatası:', error);
      } else if (data) {
        const fetchedData = {};
        data.forEach(tomb => {
          fetchedData[tomb.id] = {
            stoneType: tomb.tas_tipi,
            name: tomb.ad_soyad,
            date: tomb.dogum_olum,
            desc: tomb.aciklama,
            is_dolu: tomb.is_dolu
          };
        });
        setSavedTombs(fetchedData);
      }
    };
    fetchTombs();
  }, []);

  // 1000 adet kare oluşturan dizi
  const tombs = Array.from({ length: TOTAL_TOMBS }, (_, i) => i + 1);

  const handleTombClick = (id) => {
    setSelectedTomb(id);
    if (savedTombs[id]) {
      setStoneType(savedTombs[id].stoneType);
      setFormData({
        name: savedTombs[id].name,
        date: savedTombs[id].date,
        desc: savedTombs[id].desc
      });
    } else {
      setStoneType('monument');
      setFormData({ name: '', date: '', desc: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const saveTomb = async () => {
    if (selectedTomb) {
      setIsProcessing(true); // Yükleniyor durumu başladı

      try {
        // 1. Double-Check Verification (Mükerrer Satın Alma Engeli)
        const { data: existingTomb, error: checkError } = await supabase
          .from('mezarlar')
          .select('is_dolu')
          .eq('id', selectedTomb)
          .single();

        if (!checkError && existingTomb && existingTomb.is_dolu) {
          alert(t.tombTaken);
          setIsProcessing(false);
          closeModal();
          return;
        }

        // 2. XSS Sanitization (Girdi Temizliği)
        const sanitizedName = DOMPurify.sanitize(formData.name).substring(0, 50);
        const sanitizedDate = DOMPurify.sanitize(formData.date).substring(0, 30);
        const sanitizedDesc = DOMPurify.sanitize(formData.desc).substring(0, 200);

        if (!sanitizedName || !sanitizedDate) {
           alert(t.nameDateRequired);
           setIsProcessing(false);
           return;
        }

        const selectedStone = currentStoneOptions.find(s => s.id === stoneType);
        const priceString = selectedStone.price.replace('$', '');
        const amountInDollars = Number(priceString);

        const selectedTokenMint = SUPPORTED_TOKENS[paymentToken];

        // 3. Ödemeyi Başlat
        await processPayment(amountInDollars, selectedTokenMint, async ({ signature, transferAmount, isNativeSol }) => {
          
          setIsProcessing(true); // Yüklenme mesajı değişmeyecek (ÖDEME DOĞRULANIYOR...)
          console.log("Edge Function başlatılıyor...", { signature, transferAmount, isNativeSol });

          // 4. Supabase Edge Function'a İstek At (Güvenli Backend Doğrulaması)
          const { data, error } = await supabase.functions.invoke('verify-payment', {
            body: {
              signature,
              parselId: selectedTomb,
              ad_soyad: sanitizedName,
              dogum_olum: sanitizedDate,
              aciklama: sanitizedDesc,
              tas_tipi: stoneType,
              expectedAmount: transferAmount,
              isNativeSol,
              cuzdan_adresi: publicKey?.toBase58()
            }
          });

          if (error) {
            console.error("Edge Function hatası:", error);
            alert(`${t.paymentFailed} ${error.message || 'Bilinmeyen Hata'}\n\n${t.dbNotUpdated}`);
          } else if (data && data.error) {
             alert(`${t.paymentNotVerified} ${data.error}\n\n${t.monumentNotAdded}`);
          } else {
            console.log("Edge Function başarıyla kaydı oluşturdu:", data);
            
            // Başarılı ise arayüzü güncelle
            setSavedTombs(prev => ({
              ...prev,
              [selectedTomb]: { stoneType, name: sanitizedName, date: sanitizedDate, desc: sanitizedDesc, is_dolu: true }
            }));
            
            alert(t.successAlert);
          }
          closeModal();
        });

      } catch (err) {
        console.error('Kayıt işlemi sırasında hata oluştu:', err);
      } finally {
        setIsProcessing(false); // Bitti
      }
    }
  };

  const getStoneIcon = (type) => {
    const stone = currentStoneOptions.find(s => s.id === type);
    return stone ? stone.icon : '';
  };

  return (
    <div className="necropolis-container">
      {/* Dev Izgara */}
      <div className="grid-wrapper">
        <div className="grid">
          {tombs.map((id) => (
              <div
                key={id}
                className={`tombstone ${selectedTomb === id ? 'selected' : ''} ${savedTombs[id] ? 'saved' : ''} ${savedTombs[id] && savedTombs[id].stoneType === 'monument' ? 'premium-red' : ''}`}
                onClick={() => handleTombClick(id)}
                title={`Mezar #${id}${savedTombs[id] ? ` - ${savedTombs[id].name}` : ''}`}
              >
              {savedTombs[id] && (
                <span className="tomb-icon">
                  {getStoneIcon(savedTombs[id].stoneType)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mezar Seçimi Modal (Pop-up) */}
      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">REST IN PROFIT (#{selectedTomb})</h2>
            <button className="close-btn" onClick={closeModal}>×</button>
          </div>

          <div className="modal-body">
            {/* EĞER KAYIT VARSA - SALT OKUNUR (READ-ONLY) GÖRÜNÜM */}
            {savedTombs[selectedTomb] && savedTombs[selectedTomb].is_dolu ? (
              <div className="read-only-view">
                <div className="stone-options" style={{justifyContent: 'center', pointerEvents: 'none', marginBottom: '30px'}}>
                  <div className="stone-option selected">
                    <span className="stone-icon">{getStoneIcon(savedTombs[selectedTomb].stoneType)}</span>
                    <span className="stone-label" style={{color: '#FFD700'}}>{currentStoneOptions.find(s => s.id === savedTombs[selectedTomb].stoneType)?.label}</span>
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label" style={{color: '#FFD700', fontSize: '0.8rem'}}>{t.nameLabel}</label>
                  <div style={{color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', paddingTop: '5px'}}>{savedTombs[selectedTomb].name}</div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{color: '#FFD700', fontSize: '0.8rem'}}>{t.dateLabel}</label>
                  <div style={{color: '#cbd5e1', fontSize: '1rem', paddingTop: '5px'}}>{savedTombs[selectedTomb].date}</div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{color: '#FFD700', fontSize: '0.8rem'}}>{t.descLabel}</label>
                  <div style={{color: '#cbd5e1', fontSize: '1rem', fontStyle: 'italic', padding: '15px', background: 'rgba(0,0,0,0.5)', borderRadius: '6px', marginTop: '5px'}}>
                    "{savedTombs[selectedTomb].desc}"
                  </div>
                </div>
              </div>

            ) : (
              // EĞER KAYIT YOKSA - SATIN ALMA GÖRÜNÜMÜ
              <>
                <h3 className="stone-options-title">{t.stoneOption}</h3>
                <div className="stone-options">
                  {currentStoneOptions.map((option) => (
                    <div 
                      key={option.id}
                      className={`stone-option ${stoneType === option.id ? 'selected' : ''}`}
                      onClick={() => setStoneType(option.id)}
                    >
                      <span className="stone-icon">{option.icon}</span>
                      <span className="stone-label">{option.label}</span>
                      <span className="stone-price">{option.price}</span>
                    </div>
                  ))}
                </div>

                <div className="form-group">
                  <label className="form-label">{t.nameLabel}</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={t.namePlaceholder} 
                    value={formData.name}
                    maxLength={50}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t.dateLabel}</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder={t.datePlaceholder} 
                    value={formData.date}
                    maxLength={30}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t.descLabel}</label>
                  <textarea 
                    className="form-input" 
                    placeholder={t.descPlaceholder}
                    value={formData.desc}
                    maxLength={200}
                    onChange={(e) => setFormData({...formData, desc: e.target.value})}
                  ></textarea>
                </div>

                <div className="form-group token-selection">
                  <label className="form-label">{t.selectToken}</label>
                  <div className="token-toggle">
                    <button 
                      className={`token-btn ${paymentToken === 'USDC' ? 'active' : ''}`}
                      onClick={() => setPaymentToken('USDC')}
                    >
                      USDC
                    </button>
                    <button 
                      className={`token-btn ${paymentToken === 'USDT' ? 'active' : ''}`}
                      onClick={() => setPaymentToken('USDT')}
                    >
                      USDT
                    </button>
                    <button 
                      className={`token-btn ${paymentToken === 'SOL' ? 'active' : ''}`}
                      onClick={() => setPaymentToken('SOL')}
                    >
                      SOL
                    </button>
                  </div>
                </div>

                <button className="submit-btn" onClick={saveTomb} disabled={isProcessing}>
                  {isProcessing ? t.verifying : t.saveBtn}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Yeni Sayfalar ve Navigasyon ---

// Anasayfa Arkaplanı İçin Ölü (Tıklanamaz / Animasyonsuz) Kopya Kılavuz (Yapay Duvar Kağıdı Etkisi Yapması İçin)
function HomeBackgroundGrid() {
  const dummyTombs = Array.from({ length: TOTAL_TOMBS }, (_, i) => i);
  return (
    <div className="home-dummy-wrapper">
      <div className="home-dummy-grid">
        {dummyTombs.map(i => <div key={i} className="home-dummy-tombstone"></div>)}
      </div>
      <div className="home-fog-overlay"></div>
    </div>
  );
}

function Home({ setView, t }) {
  return (
    <div className="home-container">
      <HomeBackgroundGrid />
      <div className="home-content">
        <h1 className="home-title">{t.heroTitle}</h1>
        <p className="home-subtitle">{t.heroSubtitle}</p>
        <p className="home-subtitle" style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '-10px', marginBottom: '30px' }}>
          {t.heroExtra}
        </p>
        <button className="home-btn" onClick={() => setView('necropolis')}>
          {t.heroBtn}
        </button>

        {/* RIPO Token Tanıtım Kartı */}
        <div className="ripo-card">
          <div className="ripo-card-content">
            <h2 className="ripo-card-title">
              <span style={{ fontSize: '2.2rem', color: '#fff' }}>🪙</span>
              {t.ripoTitle}
            </h2>
            <p className="ripo-card-subtitle">{t.ripoSubtitle}</p>
            <p className="ripo-card-desc">{t.ripoDesc}</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function Support({ t }) {
  return (
    <div className="support-container">
      <div className="support-content">
        <h1 className="support-title">{t.supportTitle}</h1>
        <p className="support-text">{t.supportText}</p>
        <a href="mailto:destek@restinprofit.com" className="support-btn" onClick={(e) => e.preventDefault()}>{t.supportBtn}</a>
      </div>
    </div>
  );
}

function About({ t }) {
  return (
    <div className="about-container">
      <div className="about-content" style={{ maxWidth: '900px', textAlign: 'left' }}>
        <h1 className="about-title" style={{ fontSize: '3rem', textAlign: 'center' }}>{t.aboutTitle}</h1>
        <div className="about-text" style={{ fontSize: '1.1rem' }}>
          <p>{t.aboutP1}</p>
          <p dangerouslySetInnerHTML={{ __html: t.aboutP2 }}></p>
          
          <h2 style={{ color: '#FFD700', marginTop: '40px', marginBottom: '15px', fontFamily: "'Playfair Display', serif" }}>{t.aboutH2_1}</h2>
          <p>{t.aboutP3}</p>
          <p>{t.aboutP4}</p>

          <h2 style={{ color: '#FFD700', marginTop: '40px', marginBottom: '15px', fontFamily: "'Playfair Display', serif" }}>{t.aboutH2_2}</h2>
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            <li style={{ marginBottom: '15px', color: '#ebd08c' }} dangerouslySetInnerHTML={{ __html: t.aboutLi1 }}></li>
            <li style={{ marginBottom: '15px', color: '#ebd08c' }} dangerouslySetInnerHTML={{ __html: t.aboutLi2 }}></li>
            <li style={{ marginBottom: '15px', color: '#ebd08c' }} dangerouslySetInnerHTML={{ __html: t.aboutLi3 }}></li>
          </ul>

          <h2 style={{ color: '#FFD700', marginTop: '40px', marginBottom: '15px', fontFamily: "'Playfair Display', serif" }}>{t.aboutH2_3}</h2>
          <p>{t.aboutP5}</p>
          <p>{t.aboutP6}</p>
        </div>
      </div>
    </div>
  );
}

function FAQ({ t }) {
  return (
    <div className="faq-container">
      <div className="faq-content">
        <h1 className="faq-title">{t.faqTitle}</h1>
        <p className="faq-text">
          <b>{t.faqQ1}</b> {t.faqA1}<br/><br/>
          <b>{t.faqQ2}</b> {t.faqA2}
        </p>
      </div>
    </div>
  );
}

function Admin({ t }) {
  const [purchasedTombs, setPurchasedTombs] = useState([]);

  useEffect(() => {
    const fetchPurchasedTombs = async () => {
      const { data, error } = await supabase
        .from('mezarlar')
        .select('id, ad_soyad, cuzdan_adresi')
        .eq('is_dolu', true)
        .order('id', { ascending: true });
        
      if (!error && data) {
        setPurchasedTombs(data);
      }
    };
    fetchPurchasedTombs();
  }, []);

  return (
    <div className="support-container" style={{ overflowY: 'auto', padding: '100px 20px' }}>
      <div className="support-content" style={{ maxWidth: '900px', width: '100%' }}>
        <h1 className="support-title" style={{ fontSize: '2rem', marginBottom: '30px' }}>{t.adminTitle}</h1>
        
        {purchasedTombs.length === 0 ? (
          <p className="support-text">{t.adminNoData}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #FFD700' }}>
                  <th style={{ padding: '15px' }}>{t.adminTableId}</th>
                  <th style={{ padding: '15px' }}>{t.adminTableName}</th>
                  <th style={{ padding: '15px' }}>{t.adminTableAddress}</th>
                </tr>
              </thead>
              <tbody>
                {purchasedTombs.map((tomb) => (
                  <tr key={tomb.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '15px', color: '#FFD700', fontWeight: 'bold' }}>#{tomb.id}</td>
                    <td style={{ padding: '15px' }}>{tomb.ad_soyad}</td>
                    <td style={{ padding: '15px', fontFamily: 'monospace', color: '#cbd5e1' }}>{tomb.cuzdan_adresi || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AppInner() {
  const [currentView, setCurrentView] = useState('home'); // home, necropolis, support, about, faq, admin
  const [lang, setLang] = useState('en');
  
  const { publicKey } = useWallet();
  const isAdmin = publicKey?.toBase58() === 'BENqM1sa1WDKhHphvrEHhWKjtSTUPEcxCPyQ2zeu3NAb';

  const t = locales[lang];

  return (
    <div className="app-root">
      {/* Üst Navigasyon Çubuğu */}
      <nav className="navbar">
        <div className="navbar-logo" onClick={() => setCurrentView('home')}>
          {t.heroTitle}
        </div>
        <div className="navbar-links">
          <button 
            className={`nav-btn ${currentView === 'home' ? 'active' : ''}`} 
            onClick={() => setCurrentView('home')}
          >
            {t.navHome}
          </button>
          <button 
            className={`nav-btn ${currentView === 'necropolis' ? 'active' : ''}`} 
            onClick={() => setCurrentView('necropolis')}
          >
            {t.navNecropolis}
          </button>
          <button 
            className={`nav-btn ${currentView === 'about' ? 'active' : ''}`} 
            onClick={() => setCurrentView('about')}
          >
            {t.navAbout}
          </button>
          <button 
            className={`nav-btn ${currentView === 'faq' ? 'active' : ''}`} 
            onClick={() => setCurrentView('faq')}
          >
            {t.navFaq}
          </button>
          <button 
            className={`nav-btn ${currentView === 'support' ? 'active' : ''}`} 
            onClick={() => setCurrentView('support')}
          >
            {t.navSupport}
          </button>

          {isAdmin && (
            <button 
              className={`nav-btn ${currentView === 'admin' ? 'active' : ''}`} 
              onClick={() => setCurrentView('admin')}
              style={{ color: '#FFD700', borderBottom: currentView === 'admin' ? '2px solid #FFD700' : 'none' }}
            >
              👑 {t.navAdmin}
            </button>
          )}
          
          {/* Dil Seçeneği Butonu */}
          <button 
             className="nav-btn lang-btn" 
             onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
             style={{ marginLeft: '10px', fontWeight: 'bold', color: '#FFD700', border: '1px solid #FFD700', padding: '5px 10px', borderRadius: '4px' }}
          >
             {lang === 'tr' ? 'EN' : 'TR'}
          </button>
          
          <div className="wallet-btn-container">
            <WalletMultiButton className="solana-wallet-btn" />
          </div>
        </div>
      </nav>

      {/* Ana İçerik Alanı (Sayfalar) */}
      <main className="main-content">
        {currentView === 'home' && <Home setView={setCurrentView} t={t} />}
        {currentView === 'necropolis' && <Necropolis t={t} publicKey={publicKey} />}
        {currentView === 'support' && <Support t={t} />}
        {currentView === 'about' && <About t={t} />}
        {currentView === 'faq' && <FAQ t={t} />}
        {currentView === 'admin' && isAdmin && <Admin t={t} />}
      </main>
    </div>
  );
}

export default function App() {
  const network = WalletAdapterNetwork.Devnet;
  
  // Güvenli RPC Bağlantısı - .env Kullanılır (Yoksa varsayılan Devnet'e düşer)
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || useMemo(() => clusterApiUrl(network), [network]);
  
  const wallets = useMemo(
      () => [
          new PhantomWalletAdapter(),
          new SolflareWalletAdapter(),
      ],
      [] // [network] devnet
  );

  return (
      <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>
                  <AppInner />
              </WalletModalProvider>
          </WalletProvider>
      </ConnectionProvider>
  );
}
