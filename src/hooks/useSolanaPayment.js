import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';

// Sabit Tahmini SOL/USD Kuru (Projede gerçek bir Oracle/API kullanılana kadar)
const SOL_USD_PRICE = 150;

// Token Mint Adresleri (Sabit / Constant Olarak Ayarlandı, SOL ise native işaretlendi)
export const SUPPORTED_TOKENS = {
    USDC: new PublicKey('EPjFW33pk329TX4LncsDe6St38e7k684LJvr9nGP887'),
    USDT: new PublicKey('Es9vMGrU9DE7g2mE2evEEjEV3e7UvA7159vzEPLpnot7'),
    SOL: 'native'
};

// Kendi Cüzdan Adresiniz (Alıcı)
const MY_WALLET_ADDRESS = new PublicKey('BENqM1sa1WDKhHphvrEHhWKjtSTUPEcxCPyQ2zeu3NAb');

export function useSolanaPayment() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const processPayment = async (amountInDollars, selectedTokenMint, onSuccess) => {
        if (!publicKey) {
            alert('Lütfen önce Solana cüzdanınızı bağlayın!');
            return;
        }

        try {
            // Token'ın yerel SOL mu yoksa SPL Token mi olduğunu kontrol et
            const isNativeSol = selectedTokenMint === 'native';
            let transferAmount;
            
            // 1. Dinamik olarak İşlem (Transaction) Oluştur
            const transaction = new Transaction();
            let receiverATA; // SPL işlemlerinde gerekecek

            if (isNativeSol) {
                // NATIVE SOL TRANSFERİ İÇİN: (Miktar hesaplaması Lamport cinsinden olmalı)
                transferAmount = Math.round((amountInDollars / SOL_USD_PRICE) * LAMPORTS_PER_SOL);
                
                const solBalance = await connection.getBalance(publicKey);
                if (solBalance < transferAmount + 5000) { // 5000 lamports = Gas fee tamponu
                    throw new Error(`Yetersiz SOL bakiyesi! (Bu işlem için en az ~$${amountInDollars} değerinde SOL gerekiyor)`);
                }

                const transferInstruction = SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: MY_WALLET_ADDRESS,
                    lamports: transferAmount
                });
                transaction.add(transferInstruction);

            } else {
                // SPL TOKEN (USDC / USDT) TRANSFERİ İÇİN: 6 ondalık hane (decimals) kullanır.
                transferAmount = amountInDollars * Math.pow(10, 6);

                const senderATA = await getAssociatedTokenAddress(selectedTokenMint, publicKey);
                receiverATA = await getAssociatedTokenAddress(selectedTokenMint, MY_WALLET_ADDRESS);

                try {
                    // Gönderenin SOL bakiyesi (işlem ücreti için)
                    const solBalance = await connection.getBalance(publicKey);
                    if (solBalance === 0) {
                        throw new Error("İşlem ücretlerini (Network Fee) karşılamak için cüzdanınızda hiç SOL bulunmuyor!");
                    }

                    // Gönderenin Token bakiyesi
                    const accountInfo = await getAccount(connection, senderATA);
                    if (Number(accountInfo.amount) < transferAmount) {
                        throw new Error("Seçtiğiniz token (USDC/USDT) için yetersiz bakiye!");
                    }
                } catch (error) {
                    if (error.name === 'TokenAccountNotFoundError' || error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
                        throw new Error("Cüzdanınızda seçilen tokene ait (USDC/USDT) hesap bulunamadı!");
                    }
                    throw error;
                }

                const transferInstruction = createTransferInstruction(senderATA, receiverATA, publicKey, transferAmount);
                transaction.add(transferInstruction);
            }
            
            // 2. İşlemi hazırla ve son blockhash'i al
            
            const {
                context: { slot: minContextSlot },
                value: { blockhash, lastValidBlockHeight }
            } = await connection.getLatestBlockhashAndContext();

            // 5. Kullanıcıya imzalat ve ağa gönder
            const signature = await sendTransaction(transaction, connection, { minContextSlot });
            console.log('İşlem İmzalandı, Onay Bekleniyor... Signature:', signature);

            // 6. İşlemi ağda onayla
            const confirmation = await connection.confirmTransaction({
                blockhash,
                lastValidBlockHeight,
                signature
            }, 'confirmed');

            if (confirmation.value.err) {
                throw new Error('İşlem ağ tarafından reddedildi! Lütfen bakiyenizi kontrol edin.');
            }

            console.log('İşlem Onaylandı! Backend (Edge Function) doğrulaması için gönderiliyor...');
            
            // 8. API / Backend Doğrulaması İçin Gerekli Verileri Döndür
            if (onSuccess) {
                await onSuccess({ signature, transferAmount, isNativeSol });
            }

        } catch (error) {
            console.error('Ödeme Reddedildi:', error);
            alert(`Ödeme Başarısız:\n${error.message}`);
        }
    };

    return { processPayment, SUPPORTED_TOKENS };
}
