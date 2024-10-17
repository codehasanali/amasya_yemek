import puppeteer, { Page } from 'puppeteer';
import fs from 'fs/promises';
import readline from 'readline';

async function readCredentialsFromLog(): Promise<{ studentNumber: string; password: string }> {
  try {
    const data = await fs.readFile('credentials.log', 'utf8');
    const [studentNumber, password] = data.trim().split('\n');
    if (!studentNumber || !password) {
      throw new Error('Invalid credentials format in log file');
    }
    return { studentNumber, password };
  } catch (error) {
    console.error('Error reading credentials from log:', error);
    throw error;
  }
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function loginToFoodSystem() {
  let browser;
  try {
    const { studentNumber, password } = await readCredentialsFromLog();
    const email = `${studentNumber}@ogrenci.amasya.edu.tr`;

    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://yemek.amasya.edu.tr/login.aspx', { waitUntil: 'networkidle0' });
    await page.type('#txtEmail', email);
    await page.type('#txtSifre', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('#btn_giris')
    ]);
    console.log('Login successful');

    while (true) {
      console.log('1: Yemek rezervasyonu yap');
      console.log('2: Rezervasyon sil');
      console.log('3: Çıkış');
      const choice = await askQuestion('Lütfen bir seçenek girin (1/2/3): ');

      if (choice === '1') {
        await makeReservation(page);
      } else if (choice === '2') {
        await cancelReservation(page);
      } else if (choice === '3') {
        break;
      } else {
        console.log('Geçersiz seçenek. Lütfen tekrar deneyin.');
      }
    }

  } catch (error) {
    console.error('Bir hata oluştu:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function makeReservation(page: Page) {
  await page.goto('https://yemek.amasya.edu.tr/-User/yeni-rezerve-islemi.aspx', { waitUntil: 'networkidle0' });
  console.log('New Reservation Operation page loaded');

  const checkboxes = await page.$$('input[id^="ContentPlaceHolder1_gridYemek_cbx_oglen_"]');
  if (checkboxes.length === 0) {
    throw new Error('Checkboxes not found');
  }

  let changedAny = false;

  for (let i = 0; i < checkboxes.length; i++) {
    const checkbox = checkboxes[i];
    const isChecked = await checkbox.evaluate((el: HTMLInputElement) => el.checked);
    
    const dateText = await page.evaluate((index: number) => {
      const dateElement = document.querySelector(`#ContentPlaceHolder1_gridYemek_lbl_yemek_tarihi_${index}`);
      return dateElement ? dateElement.textContent : null;
    }, i);
    
    if (!dateText) {
      console.log(`Could not find date text for day ${i + 1}`);
      continue;
    }

    const answer = await askQuestion(`${dateText} için rezervasyon yapmak istiyor musunuz? (e/h): `);
    const shouldBeChecked = answer.toLowerCase() === 'e';

    if (shouldBeChecked && !isChecked) {
      await checkbox.click();
      console.log(`Checked LUNCH checkbox for ${dateText}`);
      changedAny = true;
    }
  }

  if (changedAny) {
    console.log('Rezervasyonlarda değişiklik yapıldı. Kaydediliyor...');
    await page.waitForSelector('#ContentPlaceHolder1_btn_Ekle', { visible: true, timeout: 5000 });
    await page.click('#ContentPlaceHolder1_btn_Ekle');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('Rezervasyon başarıyla kaydedildi.');
  } else {
    console.log('Rezervasyonlarda değişiklik yapılmadı.');
  }
}

async function cancelReservation(page: Page) {
  while (true) {
    await page.goto('https://yemek.amasya.edu.tr/-User/gelecek-haftaki-rezervelerim.aspx', { waitUntil: 'networkidle0' });
    console.log('Existing Reservations page loaded');

    const reservations = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#ContentPlaceHolder1_gridYemek tr')).slice(1);
      return rows.map((row, index) => {
        const cells = row.querySelectorAll('td');
        return {
          index,
          date: cells[0].textContent?.trim(),
          meal: cells[1].textContent?.trim(),
        };
      });
    });

    if (reservations.length === 0) {
      console.log('Hiç rezervasyon bulunamadı.');
      return;
    }
    console.log('Mevcut rezervasyonlar:');
    reservations.forEach(({ index, date, meal }: { index: number; date: string | undefined; meal: string | undefined }) => {
      console.log(`${index + 1}: ${date} - ${meal}`);
    });

    const answer = await askQuestion('İptal etmek istediğiniz rezervasyonun numarasını girin (Çıkmak için q): ');
    
    if (answer.toLowerCase() === 'q') {
      break;
    }

    const cancelIndex = parseInt(answer) - 1;

    if (isNaN(cancelIndex) || cancelIndex < 0 || cancelIndex >= reservations.length) {
      console.log('Geçersiz numara. Lütfen tekrar deneyin.');
      continue;
    }

    try {
      await page.evaluate((index) => {
        const button = document.querySelector(`input[onclick="javascript:__doPostBack('ctl00$ContentPlaceHolder1$gridYemek','rezerveIPTAL$${index}')"]`) as HTMLInputElement;
        if (button) {
          button.click();
        } else {
          throw new Error('İptal butonu bulunamadı.');
        }
      }, cancelIndex);

      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      console.log(`${reservations[cancelIndex].date} tarihindeki rezervasyon iptal edildi.`);
    } catch (error) {
      console.error('Rezervasyon iptal edilirken bir hata oluştu:', error);
    }
  }
}

loginToFoodSystem();