"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const promises_1 = __importDefault(require("fs/promises"));
const readline_1 = __importDefault(require("readline"));
function readCredentialsFromLog() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = yield promises_1.default.readFile('credentials.log', 'utf8');
            const [studentNumber, password] = data.trim().split('\n');
            if (!studentNumber || !password) {
                throw new Error('Invalid credentials format in log file');
            }
            return { studentNumber, password };
        }
        catch (error) {
            console.error('Error reading credentials from log:', error);
            throw error;
        }
    });
}
function askQuestion(query) {
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}
function loginToFoodSystem() {
    return __awaiter(this, void 0, void 0, function* () {
        let browser;
        try {
            const { studentNumber, password } = yield readCredentialsFromLog();
            const email = `${studentNumber}@ogrenci.amasya.edu.tr`;
            browser = yield puppeteer_1.default.launch({ headless: true });
            const page = yield browser.newPage();
            yield page.goto('https://yemek.amasya.edu.tr/login.aspx', { waitUntil: 'networkidle0' });
            yield page.type('#txtEmail', email);
            yield page.type('#txtSifre', password);
            yield Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle0' }),
                page.click('#btn_giris')
            ]);
            console.log('Login successful');
            while (true) {
                console.log('1: Yemek rezervasyonu yap');
                console.log('2: Rezervasyon sil');
                console.log('3: Çıkış');
                const choice = yield askQuestion('Lütfen bir seçenek girin (1/2/3): ');
                if (choice === '1') {
                    yield makeReservation(page);
                }
                else if (choice === '2') {
                    yield cancelReservation(page);
                }
                else if (choice === '3') {
                    break;
                }
                else {
                    console.log('Geçersiz seçenek. Lütfen tekrar deneyin.');
                }
            }
        }
        catch (error) {
            console.error('Bir hata oluştu:', error);
        }
        finally {
            if (browser) {
                yield browser.close();
            }
        }
    });
}
function makeReservation(page) {
    return __awaiter(this, void 0, void 0, function* () {
        yield page.goto('https://yemek.amasya.edu.tr/-User/yeni-rezerve-islemi.aspx', { waitUntil: 'networkidle0' });
        console.log('New Reservation Operation page loaded');
        const checkboxes = yield page.$$('input[id^="ContentPlaceHolder1_gridYemek_cbx_oglen_"]');
        if (checkboxes.length === 0) {
            throw new Error('Checkboxes not found');
        }
        let changedAny = false;
        for (let i = 0; i < checkboxes.length; i++) {
            const checkbox = checkboxes[i];
            const isChecked = yield checkbox.evaluate((el) => el.checked);
            const dateText = yield page.evaluate((index) => {
                const dateElement = document.querySelector(`#ContentPlaceHolder1_gridYemek_lbl_yemek_tarihi_${index}`);
                return dateElement ? dateElement.textContent : null;
            }, i);
            if (!dateText) {
                console.log(`Could not find date text for day ${i + 1}`);
                continue;
            }
            const answer = yield askQuestion(`${dateText} için rezervasyon yapmak istiyor musunuz? (e/h): `);
            const shouldBeChecked = answer.toLowerCase() === 'e';
            if (shouldBeChecked && !isChecked) {
                yield checkbox.click();
                console.log(`Checked LUNCH checkbox for ${dateText}`);
                changedAny = true;
            }
        }
        if (changedAny) {
            console.log('Rezervasyonlarda değişiklik yapıldı. Kaydediliyor...');
            yield page.waitForSelector('#ContentPlaceHolder1_btn_Ekle', { visible: true, timeout: 5000 });
            yield page.click('#ContentPlaceHolder1_btn_Ekle');
            yield page.waitForNavigation({ waitUntil: 'networkidle0' });
            console.log('Rezervasyon başarıyla kaydedildi.');
        }
        else {
            console.log('Rezervasyonlarda değişiklik yapılmadı.');
        }
    });
}
function cancelReservation(page) {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            yield page.goto('https://yemek.amasya.edu.tr/-User/gelecek-haftaki-rezervelerim.aspx', { waitUntil: 'networkidle0' });
            console.log('Existing Reservations page loaded');
            const reservations = yield page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_gridYemek tr')).slice(1);
                return rows.map((row, index) => {
                    var _a, _b;
                    const cells = row.querySelectorAll('td');
                    return {
                        index,
                        date: (_a = cells[0].textContent) === null || _a === void 0 ? void 0 : _a.trim(),
                        meal: (_b = cells[1].textContent) === null || _b === void 0 ? void 0 : _b.trim(),
                    };
                });
            });
            if (reservations.length === 0) {
                console.log('Hiç rezervasyon bulunamadı.');
                return;
            }
            console.log('Mevcut rezervasyonlar:');
            reservations.forEach(({ index, date, meal }) => {
                console.log(`${index + 1}: ${date} - ${meal}`);
            });
            const answer = yield askQuestion('İptal etmek istediğiniz rezervasyonun numarasını girin (Çıkmak için q): ');
            if (answer.toLowerCase() === 'q') {
                break;
            }
            const cancelIndex = parseInt(answer) - 1;
            if (isNaN(cancelIndex) || cancelIndex < 0 || cancelIndex >= reservations.length) {
                console.log('Geçersiz numara. Lütfen tekrar deneyin.');
                continue;
            }
            try {
                yield page.evaluate((index) => {
                    const button = document.querySelector(`input[onclick="javascript:__doPostBack('ctl00$ContentPlaceHolder1$gridYemek','rezerveIPTAL$${index}')"]`);
                    if (button) {
                        button.click();
                    }
                    else {
                        throw new Error('İptal butonu bulunamadı.');
                    }
                }, cancelIndex);
                yield page.waitForNavigation({ waitUntil: 'networkidle0' });
                console.log(`${reservations[cancelIndex].date} tarihindeki rezervasyon iptal edildi.`);
            }
            catch (error) {
                console.error('Rezervasyon iptal edilirken bir hata oluştu:', error);
            }
        }
    });
}
loginToFoodSystem();
