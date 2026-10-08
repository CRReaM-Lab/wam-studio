import { doc } from "../Utils/dom";

const template = doc/*html*/`
  <style>
    :host {
      width: 100%;
      height: 52px;
      padding: 1px;
      display: flex;
      flex-direction: column;
      font-family: Roboto;
      overflow: hidden;
      z-index: 1;
      position: relative;
      -webkit-font-smoothing: antialiased;  
      padding-right: 10px;
      border-right: solid 1px rgb(111, 111, 111);
      background-color:transparent;
    }
    .time-signature-section {
      border-color: rgba(255,255,255,0.05);
    }
    #input {
      color: lightgrey;
      display: inline-block;
      border: none;
      background-color: transparent;
      padding: 0;
      border-radius: 0;
      font-family: "Unica One";
      font-size: 28px;
      height: 52px;
      line-height: 52px;
      width: 56px;
      text-align: right;
      margin-left:-5px;
      &:focus {
        outline: none;
        border: none;
        font-style: italic;
      }
      &:hover{
        font-weight: bold;
      }
      &:invalid {
        color:red;
      }
    }
    #label {
      color: lightgrey;
      font-family: Arial;
      font-size: 14px;
      margin: 0;
      padding: 0;
      border: 0;
    }
=  </style>
  <link rel="stylesheet" href="style/theme-composants.css">
  <div class="time-signature-section">
    <input id="input" value="4/4" id="time-signature" pattern="^([1-9]|[12][0-9]|3[0-2])/(1|2|4|8|16|32)$" title="Temps par mesure / valeur du temps (1, 2, 4, 8, 16 ou 32)" maxlength=5> 
    <span id="label">sig</span> 
  </div>
`;

/**
 * A custom element that allows the user to select a time signature.
 */
export default class TimeSignatureElement extends HTMLElement {

  /** Le dénominateur est une valeur de note : une puissance de deux, pas un nombre quelconque. */
  static readonly DENOMINATEURS = [1, 2, 4, 8, 16, 32];

  /** La dernière signature valide, rétablie quand la saisie n'en est pas une. */
  private derniere = "4/4";

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    if (this.shadowRoot !== null) {
      this.shadowRoot.replaceChildren(template.cloneNode(true))
      this.defineListeners();
    }
  }

  get input(){ return this.shadowRoot!.querySelector("#input") as HTMLInputElement }

  /**
   * The time signature as a array. 
   * Per example: 4/4 is [4,4], 8/4 is [8,4]
   */
  get timeSignature(): [number,number] {
    const splitted= this.input.value.split("/")
    return [parseInt(splitted[0])??4, parseInt(splitted[1])??4]
  }

  set timeSignature(value: [number,number]) {
    const numerateur = Math.min(32, Math.max(1, Math.round(value[0] ?? 4)))
    // Le dénominateur le plus proche parmi les valeurs de note (7 → 8).
    const voulu = value[1] ?? 4
    const denominateur = TimeSignatureElement.DENOMINATEURS.reduce((a, b) => Math.abs(b - voulu) < Math.abs(a - voulu) ? b : a)
    this.input.value = this.derniere = numerateur + "/" + denominateur
    this.on_change.forEach(f=>f(this.timeSignature))
  }


  private defineListeners() {
    this.input.addEventListener("change", (event)=> {
      if(!this.input.validity.valid){
        this.input.value=this.derniere
      }
      this.derniere=this.input.value
      this.on_change.forEach(f=>f(this.timeSignature))
    })
  }

  readonly on_change= new Set<(newTimeSignature:[number,number])=>void>()
}

customElements.define("wamstudio-time-signature", TimeSignatureElement);