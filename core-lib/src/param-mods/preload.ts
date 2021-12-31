class ParamPreload extends ParamBase {

  public static parseConf(conf: string) {
    if (conf === 'off') {
      return
    }
    if (conf === 'on') {
      return []
    }
    return 'invalid value'
  }
}