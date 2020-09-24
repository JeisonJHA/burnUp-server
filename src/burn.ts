import puppeteer from 'puppeteer';
import { eachDayOfInterval, isWeekend, parse, isSameDay, isAfter } from 'date-fns'

interface ICard {
    storyPoints: number
    status: string
    resolutionDate?: Date | null
    resolutionDateString: string
}

interface IBurnUp {
    date: Date
    fds: boolean
    ideal: number
    total_feito: number
    dia_feito: number
    debito: number
    burndown: number
}

interface IStories {
    day: number
    sum: number
}

export interface IDadosBurn {
    usuario: string
    senha: string
    inicio: Date
    fim: Date
}

export default class Burn {
    private totalStories: number
    private totalDias: number

    constructor(
        private RTC_URL: string,
        private debug: boolean,
    ) {
    }
    public async getDados(data: IDadosBurn) {
        try {
            const { inicio, fim, usuario, senha } = data;

            const cards = await this.pegarCards(usuario, senha)
            this.totalStories = cards.reduce((acc, item) => item.storyPoints + acc, 0)

            let burnUp = this.inicializarDadosBurnUp(inicio, fim)

            const total = cards
                .filter((card) => card.status === 'Pronto')
                .sort(this.compare)
                .reduce((acc, card, _, array) => {
                    if (!card.resolutionDate) return acc.set(new Date().toDateString(), {} as IStories)
                    const story = acc.get(card.resolutionDate.toDateString())
                    if (story) {
                        return acc.set(card.resolutionDate.toDateString(), story)
                    }
                    let total = array.reduce((acc, current) => {
                        let sum = acc.sum
                        let day = acc.day
                        if (current.resolutionDate && card.resolutionDate) {
                            day = isSameDay(current.resolutionDate, card.resolutionDate) ? acc.day + current.storyPoints : acc.day
                            sum = isAfter(card.resolutionDate, current.resolutionDate) ? acc.sum + current.storyPoints : acc.sum
                        }
                        return { day, sum }
                    }, { day: 0, sum: 0 } as IStories)
                    return acc.set(new Date(card.resolutionDate.setHours(0,0,0)).toDateString(), total)
                }, new Map<string, IStories>())

            this.logar(total)
            burnUp = this.montarBurnUp(burnUp, total)
            return burnUp
        } catch (error) {
            console.log(error);
        }
    }

    private logar(log: any) {
        if (!this.debug) return
        console.log(log)
    }

    async pegarCards(usuario: string, senha: string): Promise<ICard[]> {
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.goto(this.RTC_URL, { waitUntil: 'networkidle0' });
        await page.type('input[name="j_username"]', usuario);
        await page.type('input[name="j_password"]', senha);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.keyboard.press('Enter')
        ]);
        const cards =
            await page.evaluate(() => {
                const cardsElements = document.getElementsByClassName("com-ibm-team-apt-web-ui-internal-common-viewer-plan-board-TaskNote");
                let cards: ICard[] = new Array<ICard>();
                for (let item = 0; item < cardsElements.length; item++) {
                    const element = cardsElements[item];
                    cards.push({
                        storyPoints: + (element.querySelector('[id*="EnumerationGadget"]')?.textContent ?? 0),
                        status: element.querySelector('[id*="StateGadget"]')?.textContent ?? 'Unknown',
                        resolutionDateString: element.querySelector('[id*="DateGadget"]')?.textContent ?? 'Unknown'
                    })
                }
                return cards
            });
        await browser.close();

        this.logar(cards)
        return cards.map((card) => ({ ...card, resolutionDate: this.formatStringToDateString(card.resolutionDateString) }))
    }

    private formatStringToDateString(date?: string): Date | null {
        if (!date || date === '--') return null
        if (date.includes('/')) return parse(date, 'dd/MM/yyyy HH:mm:ss', new Date())
        return parse(date, 'LLL dd, yyyy, hh:mm:ss a', new Date())
    }

    private inicializarDadosBurnUp(start: Date, end: Date) {
        const dates = eachDayOfInterval({ start, end })
        const burnUp = dates.map((date) => ({ date: date, fds: isWeekend(date) } as IBurnUp))
        this.calcularTotalDias(burnUp)
        return this.calcularIdeal(burnUp)
    }

    private calcularTotalDias(burnUp: IBurnUp[]) {
        this.totalDias = burnUp.reduce((acc, item) => item.fds ? acc : acc + 1, 0)
    }

    private calcularIdeal(burnUp: IBurnUp[]) {
        const totalStories = this.totalStories;
        const totalDias = this.totalDias;
        let count = 0
        return burnUp.map(element => {
            if (element.fds) return element
            count++
            return { ...element, ideal: Math.round((totalStories / totalDias) * count) }
        });
    }

    private montarBurnUp(burnUp: IBurnUp[], total: Map<string, IStories>) {
        burnUp = burnUp.map((item) => {
            const story = total.get(item.date.toDateString())
            this.logar(story)
            if (item.fds) return item
            if (!story) return { ...item, dia_feito: 0, total_feito: 0 };
            return { ...item, dia_feito: story.day, total_feito: story.sum }
        })
        this.logar(burnUp)
        burnUp = this.calcularDebito(burnUp)
        return this.calcularBurndown(burnUp)
    }

    private calcularDebito(burnUp: IBurnUp[]) {
        return burnUp.map((item, index, array) => {
            if (item.fds) return item
            const debito = item.ideal - ((index + 1 < array.length ? array[this.pegarProximoIndiceDiaValido(array, index + 1)].total_feito : item.total_feito) ?? 0)
            return { ...item, debito }
        })
    }

    private calcularBurndown(burnUp: IBurnUp[]) {
        return burnUp.map(item =>
            (item.fds ? item :
                { ...item, burndown: this.totalStories - item.total_feito }
            ))
    }

    private pegarProximoIndiceDiaValido(burnUp: IBurnUp[], indice: number) {
        return burnUp.findIndex((item, index) => index >= indice && !item.fds)
    }

    private compare(a: ICard, b: ICard) {
        const bandA = a.resolutionDate ?? 0;
        const bandB = b.resolutionDate ?? 0;

        let comparison = 0;
        if (bandA > bandB) {
            comparison = 1;
        } else if (bandA < bandB) {
            comparison = -1;
        }
        return comparison;
    }
}

