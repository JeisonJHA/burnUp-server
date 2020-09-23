import puppeteer from 'puppeteer';
import { eachDayOfInterval, isWeekend, format } from 'date-fns'

interface ICard {
    storyPoints: number
    status: string
    resolutionDate: string
}

interface IBurnUp {
    date: string
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
                    const story = acc.get(card.resolutionDate)
                    if (story) {
                        return acc.set(card.resolutionDate, story)
                    }
                    let total = array.reduce((acc, current) => {
                        return {
                            day: current.resolutionDate === card.resolutionDate ? acc.day + current.storyPoints : acc.day,
                            sum: current.resolutionDate <= card.resolutionDate ? acc.sum + current.storyPoints : acc.sum
                        }
                    }, { day: 0, sum: 0 } as IStories)
                    return acc.set(card.resolutionDate, total)
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
                const formatStringToDateString = (date?: string): string => {
                    if (!date) return 'unknown'
                    if (date === '--') return date
                    if (date.includes('/')) return date.split(' ')[0]
                    return new Date(Date.parse(date)).toISOString()
                }
                const cardsElements = document.getElementsByClassName("com-ibm-team-apt-web-ui-internal-common-viewer-plan-board-TaskNote");
                let cards: ICard[] = new Array<ICard>();
                for (let item = 0; item < cardsElements.length; item++) {
                    const element = cardsElements[item];
                    cards.push({
                        storyPoints: + (element.querySelector('[id*="EnumerationGadget"]')?.textContent ?? 0),
                        status: element.querySelector('[id*="StateGadget"]')?.textContent ?? 'Unknown',
                        resolutionDate: formatStringToDateString(element.querySelector('[id*="DateGadget"]')?.textContent ?? undefined)
                    })
                }
                return cards
            });
        await browser.close();
        this.logar(cards)
        return cards
    }

    private inicializarDadosBurnUp(start: Date, end: Date) {
        const dates = eachDayOfInterval({ start, end })
        const burnUp = dates.map((date) => ({ date: format(date, 'dd/MM/yyyy'), fds: isWeekend(date) } as IBurnUp))
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
            const story = total.get(item.date)
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
        const bandA = a.resolutionDate;
        const bandB = b.resolutionDate;

        let comparison = 0;
        if (bandA > bandB) {
            comparison = 1;
        } else if (bandA < bandB) {
            comparison = -1;
        }
        return comparison;
    }
}

