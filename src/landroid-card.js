import { LitElement, html, nothing } from 'lit';
import { hasConfigOrEntityChanged, fireEvent } from 'custom-card-helpers';
import registerTemplates from 'ha-template';
import get from 'lodash.get';
import localize from './localize';
import styles from './styles';
import defaultImage from './landroid.svg';
import { version } from '../package.json';
import './landroid-card-editor';
import defaultConfig from './defaults';
import LandroidCardEditor from './landroid-card-editor';

const editorName = 'landroid-card-editor';
const DEFAULT_LANG = 'en-GB';
customElements.define(editorName, LandroidCardEditor);

registerTemplates();

console.info(
  `%c LANDROID-CARD %c ${version} `,
  'color: white; background: #ec6a36; font-weight: 700; border: 1px #ec6a36 solid; border-radius: 4px 0px 0px 4px;',
  'color: #ec6a36; background: white; font-weight: 700; border: 1px #ec6a36 solid; border-radius: 0px 4px 4px 0px;'
);

// if (!customElements.get('ha-icon-button')) {
//   customElements.define(
//     'ha-icon-button',
//     class extends customElements.get('paper-icon-button') {}
//   );
// }

class LandroidCard extends LitElement {
  static get properties() {
    return {
      hass: Object,
      config: Object,
      requestInProgress: Boolean,
      showConfigPanel: Boolean,
    };
  }

  static get styles() {
    return styles;
  }

  static async getConfigElement() {
    return document.createElement(editorName);
  }

  static getStubConfig(hass, entities) {
    const [landroidEntity] = entities.filter(
      (eid) => eid.substr(0, eid.indexOf('.')) === 'vacuum'
    );

    return {
      entity: landroidEntity || '',
      image: 'default',
    };
  }

  get entity() {
    return this.hass.states[this.config.entity];
  }

  get lang() {
    let langStored;

    try {
      langStored = JSON.parse(localStorage.getItem('selectedLanguage'));
    } catch (e) {
      langStored = localStorage.getItem('selectedLanguage');
    }

    return (langStored || navigator.language.split('-')[0] || DEFAULT_LANG)
      .replace(/['"]+/g, '')
      .replace('_', '-');
  }

  get camera() {
    if (!this.hass) {
      return null;
    }
    return this.hass.states[this.config.camera];
  }

  get image() {
    if (this.config.image === 'default') {
      return defaultImage;
    }

    return this.config.image || defaultImage;
  }

  get showAnimation() {
    if (this.config.show_animation === undefined) {
      return true;
    }

    return this.config.show_animation;
  }

  get compactView() {
    if (this.config.compact_view === undefined) {
      return false;
    }

    return this.config.compact_view;
  }

  get showName() {
    if (this.config.show_name === undefined) {
      return true;
    }

    return this.config.show_name;
  }

  get showStatus() {
    if (this.config.show_status === undefined) {
      return true;
    }

    return this.config.show_status;
  }

  get showConfigbar() {
    if (this.config.show_configbar === undefined) {
      return true;
    }

    return this.config.show_configbar;
  }

  get showToolbar() {
    if (this.config.show_toolbar === undefined) {
      return true;
    }

    return this.config.show_toolbar;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error(localize('error.missing_entity'));
    }

    const actions = config.actions;
    if (actions && Array.isArray(actions)) {
      console.warn(localize('warning.actions_array'));
    }

    this.config = {
      ...defaultConfig,
      ...config,
    };

    // this.config = config;
  }

  getCardSize() {
    return this.config.compact_view || false ? 3 : 8;
  }

  shouldUpdate(changedProps) {
    return hasConfigOrEntityChanged(this, changedProps);
  }

  updated(changedProps) {
    if (
      changedProps.get('hass') &&
      changedProps.get('hass').states[this.config.entity].state !==
        this.hass.states[this.config.entity].state
    ) {
      this.requestInProgress = false;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this.compactView && this.camera) {
      this.requestUpdate();
      this.thumbUpdater = setInterval(
        () => this.requestUpdate(),
        (this.config.camera_refresh || 5) * 1000
      );
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.camera) {
      clearInterval(this.thumbUpdater);
    }
  }

  handleMore(entityId = this.entity.entity_id) {
    fireEvent(
      this,
      'hass-more-info',
      {
        entityId,
      },
      {
        bubbles: false,
        composed: true,
      }
    );
  }

  handleService(e, service) {
    switch (service) {
      case 'setzone':
        {
          const zone = e.target.getAttribute('value');
          this.callService(service, { isRequest: false }, { zone });
        }
        break;

      case 'raindelay':
        {
          const raindelay = e.target.getAttribute('value');
          this.callService('config', { isRequest: false }, { raindelay });
        }
        break;

      default:
        this.handleMore();
        break;
    }
  }

  handleAction(action, params = { isRequest: true }) {
    const actions = this.config.actions || {};

    return () => {
      if (!actions[action]) {
        this.callService(params.defaultService || action, {
          isRequest: params.isRequest,
        });
        return;
      }

      this.callAction(actions[action]);
    };
  }

  /**
   * Choose between vacuum and landroid_cloud domain and call service
   * @param {string} service
   * @param {Object} params
   * @param {Object} options Service options
   */
  callService(service, params = { isRequest: true }, options = {}) {
    if (service === 'more') {
      this.handleMore();
      return;
    }

    let domain = 'vacuum';
    const landroidServices = [
      'config',
      'edgecut',
      'lock',
      'ots',
      'partymode',
      'poll',
      'restart',
      'setzone',
      'schedule',
    ];

    if (landroidServices.includes(service)) {
      domain = 'landroid_cloud';
    }

    this.hass.callService(domain, service, {
      entity_id: [this.config.entity],
      ...options,
    });

    if (params.isRequest) {
      this.requestInProgress = true;
      this.requestUpdate();
    }
  }

  /**
   * Call the action
   * @param {Object} action service, service_data
   */
  callAction(action) {
    const { service, service_data } = action;
    const [domain, name] = service.split('.');
    this.hass.callService(domain, name, service_data);
  }

  /**
   * Determines the attributes for the entity
   * @param {Object} entity
   * @return {AttributesObject}
   */
  getAttributes(entity) {
    const {
      status,
      state,

      battery_level,
      battery_icon,
      accessories,
      battery,
      blades,
      error,
      firmware,
      locked,
      mac_address,
      model,
      online,
      orientation,
      rain_sensor,
      schedule,
      serial_number,
      status_info,
      time_zone,
      zone,
      capabilities,
      mqtt_connected,
      supported_landroid_features,
      daily_progress, // > 2.3.0
      next_scheduled_start, // > 2.3.0
      party_mode_enabled,
      rssi,
      statistics,
      torque,
      state_updated_at,
      device_class,
      friendly_name,
      supported_features,

      // IF Landroid Cloud <= 2.0.3
      battery_voltage,
      battery_temperature,
      total_charge_cycles,
      current_charge_cycles,
      total_blade_time,
      current_blade_time,
      blade_time_reset,
      error_id,
      firmware_version,
      mac,
      pitch,
      roll,
      yaw,
      rain_delay,
      rain_sensor_triggered,
      rain_delay_remaining,
      serial,
      mowing_zone,
      zone_probability,
      work_time,
      distance,
      last_update,
      // ENDIF Landroid Cloud <= 2.0.3
    } = entity.attributes;

    return {
      status: status || state || entity.state || '-',
      state: status || state || entity.state || '-',

      battery_level: battery_level || 100,
      battery_icon: battery_icon || 'mdi:battery',
      accessories: accessories || '-',
      battery: battery || {
        cycles: {
          total: total_charge_cycles || 0,
          current: current_charge_cycles || 0,
          reset_at: '-',
          reset_time: '1970-01-01T00:00:00+00:00',
        },
        temperature: battery_temperature || 0,
        voltage: battery_voltage || 0,
        percent: battery_level || 0,
        charging: false,
      },
      blades: blades || {
        total_on: total_blade_time || 0,
        reset_at: total_blade_time - current_blade_time || 0,
        reset_time: blade_time_reset || '1970-01-01T00:00:00+00:00',
        current_on: current_blade_time || 0,
      },
      error: this.isObject(error)
        ? error
        : { id: error_id || 0, description: error || '-' },
      firmware: firmware || {
        auto_upgrade: false,
        version: firmware_version || 0,
      },
      locked,
      mac_address: mac_address || mac || '-',
      model: model || '',
      online: online || false,
      orientation: orientation || {
        pitch: pitch || 0,
        roll: roll || 0,
        yaw: yaw || 0,
      },
      rain_sensor: rain_sensor || {
        delay: rain_delay || 0,
        triggered: rain_sensor_triggered || false,
        remaining: rain_delay_remaining || 0,
      },
      schedule: schedule || '',
      serial_number: serial_number || serial || '-',
      status_info: status_info || {
        id: 0,
        description: status || state || entity.state || '-',
      },
      time_zone: time_zone || '-',
      zone: model
        ? zone
        : {
            current: 0,
            next: 0,
            index: mowing_zone || 0,
            indicies: zone_probability || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            starting_point: zone || [0, 0, 0, 0],
          },
      capabilities: capabilities || '',
      mqtt_connected: mqtt_connected || false,
      supported_landroid_features: supported_landroid_features || 0,
      daily_progress: daily_progress || 0,
      next_scheduled_start: next_scheduled_start || '1970-01-01T00:00:00+00:00',
      party_mode_enabled: party_mode_enabled || 0,
      rssi: rssi || -99,
      statistics: statistics || {
        worktime_blades_on: work_time || 0,
        distance: distance || 0,
        worktime_total: 0,
      },
      torque: torque || 100,
      state_updated_at:
        state_updated_at || last_update || '1970-01-01T00:00:00+00:00',
      device_class: device_class || 'landroid_cloud__state',
      friendly_name: friendly_name || '',
      supported_features: supported_features || 12500,
    };
  }

  /**
   * Format value according to locale
   * @param {string} name Name of Attribute
   * @param {string} valueToFormat Value to formating
   * @return {FormatedValue}
   */
  formatValue(name, valueToFormat) {
    if (valueToFormat === undefined || valueToFormat === null) {
      return '-';
    }

    let lang = this.lang || DEFAULT_LANG;

    // If language in Home Assistant set as 'Test' raised 'Uncaught (in promise) RangeError: Incorrect locale'
    try {
      (1).toLocaleString(lang, {
        style: 'unit',
        unit: 'kilometer',
        unitDisplay: 'short',
      });
    } catch (error) {
      lang = DEFAULT_LANG;
    }

    switch (name) {
      case 'distance': {
        const parced = parseInt(valueToFormat) || 0;
        const { length } = this.hass.config['unit_system'] || 'km';
        return length === 'km'
          ? (parced / 1000).toLocaleString(lang, {
              style: 'unit',
              unit: 'kilometer',
              unitDisplay: 'short',
            })
          : (parced / 1609).toLocaleString(lang, {
              style: 'unit',
              unit: 'mile',
              unitDisplay: 'short',
            });
      }

      case 'temperature': {
        const parced = parseFloat(valueToFormat) || 0;
        const { temperature } = this.hass.config['unit_system'] || '°C';
        return temperature === '°C'
          ? parced.toLocaleString(lang, {
              style: 'unit',
              unit: 'celsius',
            })
          : parced.toLocaleString(lang, {
              style: 'unit',
              unit: 'fahrenheit',
            });
      }

      case 'battery_level':
      case 'daily_progress':
      case 'percent':
      case 'rssi':
      case 'torque': {
        const parced = parseInt(valueToFormat) || 0;
        return parced.toLocaleString(lang, {
          style: 'unit',
          unit: 'percent',
        });
      }

      case 'voltage': {
        const parced = parseFloat(valueToFormat) || 0;
        return `${parced.toLocaleString(lang)} ${localize('units.voltage')}`;
        // parced.toLocaleString(lang, { style: "unit", unit: "volt" });
      }

      case 'pitch':
      case 'roll':
      case 'yaw': {
        return valueToFormat.toLocaleString(lang, {
          style: 'unit',
          unit: 'degree',
        });
      }

      case 'total':
      case 'current':
        return valueToFormat.toLocaleString(lang);

      case 'reset_at':
      case 'total_on':
      case 'current_on':
      case 'remaining':
      case 'time_extension':
      case 'duration':
      case 'worktime_blades_on':
      case 'worktime_total': {
        const parced = parseInt(valueToFormat) || 0;
        const days = Math.floor(parced / 1440);
        const hours = Math.floor((parced % 1440) / 60);
        const minutes = Math.floor((parced % 1440) % 60);
        return `${
          days
            ? days.toLocaleString(lang, {
                style: 'unit',
                unit: 'day',
              })
            : ''
        } ${
          hours
            ? hours.toLocaleString(lang, {
                style: 'unit',
                unit: 'hour',
              })
            : ''
        } ${
          minutes
            ? minutes.toLocaleString(lang, {
                style: 'unit',
                unit: 'minute',
              })
            : ''
        }`.trim();
      }

      case 'last_update':
      case 'next_scheduled_start':
      case 'reset_time':
      case 'state_updated_at': {
        try {
          return Intl.DateTimeFormat(lang, {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(valueToFormat));
        } catch (error) {
          console.warn(
            `(valueToFormat - ${valueToFormat}) is not valid DateTime Format`
          );
          return '-';
        }
      }

      case 'active':
      case 'auto_upgrade':
      case 'boundary':
      case 'charging':
      case 'locked':
      case 'mqtt_connected':
      case 'online':
      case 'party_mode_enabled':
      case 'triggered':
        return valueToFormat
          ? localize('common.true') || 'true'
          : localize('common.false') || 'false';

      case 'delay':
        return (
          (Math.floor(valueToFormat / 60) || '0') +
          ':' +
          (Math.floor(valueToFormat % 60) || '00')
        );

      case 'start':
      case 'end':
      default:
        return valueToFormat.toLocaleString(lang);
    }
  }

  getIcon(entry = '') {
    const {
      battery_icon: battery_icon_attr,
      locked: locked_attr,
      online: online_attr,
      party_mode_enabled: party_mode_enabled_attr,
      rain_sensor: rain_sensor_attr,
      mqtt_connected: mqtt_connected_attr,
      rssi: rssi_attr,
      zone: zone_attr,
    } = this.getAttributes(this.entity);

    const wifi_strength =
      rssi_attr > -101 && rssi_attr < -49 ? (rssi_attr + 100) * 2 : 0;
    const { state } = this.entity;

    if (entry) {
      const icons = {
        battery_icon: battery_icon_attr,
        accessories: 'mdi:toolbox',
        battery: 'mdi:battery',
        cycles: 'mdi:battery-sync',
        blades: 'mdi:fan',
        error: 'mdi:alert-circle',
        firmware: 'mdi:information',
        locked: locked_attr ? 'mdi:lock' : 'mdi:lock-open',
        mac_address: 'mdi:barcode',
        model: 'mdi:label',
        online: online_attr ? 'mdi:web' : 'mdi:web-off',
        orientation: 'mdi:rotate-orbit',
        rain_sensor:
          rain_sensor_attr['delay'] > 0
            ? 'mdi:weather-pouring'
            : 'mdi:weather-sunny',
        schedule: 'mdi:calendar-clock',
        serial_number: 'mdi:numeric',
        status_info: 'mdi:information',
        time_zone: 'mdi:web-clock',
        // zone: 'mdi:numeric-3-box-multiple',
        zone: 'mdi:numeric-' + (zone_attr['current'] + 1) + '-box-multiple',
        current: 'mdi:numeric-' + (zone_attr['current'] + 1) + '-box-multiple',
        next: 'mdi:numeric-' + (zone_attr['next'] + 1) + '-box-multiple',
        // zone: 'mdi:checkbox-multiple-blank',
        capabilities: 'mdi:format-list-bulleted',
        mqtt_connected: mqtt_connected_attr ? 'mdi:network' : 'mdi:network-off',
        supported_landroid_features: 'mdi:star-circle-outline',
        daily_progress: 'mdi:progress-helper',
        next_scheduled_start: 'mdi:clock-start',
        party_mode_enabled: party_mode_enabled_attr
          ? 'mdi:sleep'
          : 'mdi:sleep-off',
        rssi: `mdi:wifi-strength-${
          Math.floor((wifi_strength - 1) / 20) > 0
            ? Math.floor((wifi_strength - 1) / 20)
            : 'outline'
        }`,
        statistics: 'mdi:chart-areaspline',
        torque: 'mdi:plus-minus-box',
        state_updated_at: 'mdi:update',
        supported_features: 'mdi:format-list-bulleted',

        play: 'mdi:play',
        start: 'mdi:play',
        stop: 'mdi:stop',
        pause: state === 'edgecut' ? 'mdi:motion-pause' : 'mdi:pause',
        return_to_base: 'mdi:home-import-outline',
        edgecut: state === 'edgecut' ? 'mdi:motion-pause' : 'mdi:motion-play',
      };

      return icons[entry];
    } else {
      const battery_icon = battery_icon_attr,
        accessories = 'mdi:toolbox',
        battery = 'mdi:battery',
        cycles = 'mdi:battery-sync',
        blades = 'mdi:fan',
        error = 'mdi:alert-circle',
        firmware = 'mdi:information',
        locked = locked_attr ? 'mdi:lock' : 'mdi:lock-open',
        mac_address = 'mdi:barcode',
        model = 'mdi:label',
        online = online_attr ? 'mdi:web' : 'mdi:web-off',
        orientation = 'mdi:rotate-orbit',
        rain_sensor =
          rain_sensor_attr['delay'] > 0
            ? 'mdi:weather-pouring'
            : 'mdi:weather-sunny',
        schedule = 'mdi:calendar-clock',
        serial_number = 'mdi:numeric',
        status_info = 'mdi:information',
        time_zone = 'mdi:web-clock',
        zone = 'mdi:numeric-' + (zone_attr['current'] + 1) + '-box-multiple',
        current = 'mdi:numeric-' + (zone_attr['current'] + 1) + '-box-multiple',
        next = 'mdi:numeric-' + (zone_attr['next'] + 1) + '-box-multiple',
        capabilities = 'mdi:format-list-bulleted',
        mqtt_connected = mqtt_connected_attr
          ? 'mdi:network'
          : 'mdi:network-off',
        supported_landroid_features = 'mdi:star-circle-outline',
        daily_progress = 'mdi:progress-helper',
        next_scheduled_start = 'mdi:clock-start',
        party_mode_enabled = party_mode_enabled_attr
          ? 'mdi:sleep'
          : 'mdi:sleep-off',
        rssi = `mdi:wifi-strength-${
          Math.floor((wifi_strength - 1) / 20) > 0
            ? Math.floor((wifi_strength - 1) / 20)
            : 'outline'
        }`,
        statistics = 'mdi:chart-areaspline',
        torque = 'mdi:plus-minus-box',
        state_updated_at = 'mdi:update',
        supported_features = 'mdi:format-list-bulleted',
        play = 'mdi:play',
        start = 'mdi:play',
        stop = 'mdi:stop',
        pause = state === 'edgecut' ? 'mdi:motion-pause' : 'mdi:pause',
        return_to_base = 'mdi:home-import-outline',
        edgecut = state === 'edgecut' ? 'mdi:motion-pause' : 'mdi:motion-play';
      return {
        battery_icon,
        accessories,
        battery,
        cycles,
        blades,
        error,
        firmware,
        locked,
        mac_address,
        model,
        online,
        orientation,
        rain_sensor,
        schedule,
        serial_number,
        status_info,
        time_zone,
        zone,
        current,
        next,
        capabilities,
        mqtt_connected,
        supported_landroid_features,
        daily_progress,
        next_scheduled_start,
        party_mode_enabled,
        rssi,
        statistics,
        torque,
        state_updated_at,
        supported_features,

        play,
        start,
        pause,
        stop,
        return_to_base,
        edgecut,
      };
    }
  }

  /**
   * Checking whether an object
   * @param {Object} Value to check
   * @return {Boolean}
   */
  isObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
  }

  /**
   * Generates the buttons menu
   * @param {string} type (battery, blades)
   * @return {TemplateResult}
   */
  renderListMenu(type) {
    if (!type) {
      return nothing;
    }

    var title = type,
      value = '',
      value_right = true,
      icon = '',
      selected = '',
      service = '',
      attributes = {};

    switch (type) {
      case 'blades':
        {
          const { blades } = this.getAttributes(this.entity);
          attributes = blades;
        }
        break;

      case 'delay':
        {
          service = 'raindelay';
          icon = 'mdi:weather-rainy';
          const { rain_sensor } = this.getAttributes(this.entity);
          value = selected = rain_sensor['delay'];
          // value = this.formatValue('delay', selected);
          for (let i = 0; i < 1440; i += 30) {
            attributes[i] = this.formatValue('delay', i);
          }
        }
        break;

      case 'rssi':
        {
          const {
            accessories,
            firmware,
            mac_address,
            model,
            online,
            rssi,
            serial_number,
            time_zone,
            capabilities,
            state_updated_at,
          } = this.getAttributes(this.entity);
          value = rssi > -101 && rssi < -49 ? (rssi + 100) * 2 : 0;
          title = type;
          attributes = {
            model,
            serial_number,
            mac_address,
            time_zone,
            online,
            state_updated_at,
            accessories: Array.isArray(accessories)
              ? Object.assign({}, accessories)
              : accessories,
            firmware: firmware,
            capabilities: Array.isArray(capabilities)
              ? Object.assign({}, capabilities)
              : capabilities,
          };
          console.log('-');
        }
        break;

      case 'stats':
        {
          const { blades, statistics } = this.getAttributes(this.entity);
          title = 'statistics';
          attributes = { blades: {}, statistics: {} };
          attributes.statistics = statistics;
          attributes.blades = blades;
        }
        break;

      case 'zone':
        {
          const { zone } = this.getAttributes(this.entity);
          selected = zone['current'];
          attributes = { zone: { 0: '1', 1: '2', 2: '3', 3: '4' } };
          service = 'setzone';
        }
        break;

      case 'battery':
      default:
        {
          ({
            battery_level: value,
            battery_icon: icon,
            battery: attributes,
          } = this.getAttributes(this.entity));
          title = 'battery_level';
          value_right = false;
        }
        break;
    }

    return html`
      <div class="tip">
        <ha-button-menu
          @click="${(e) => e.stopPropagation()}"
          title="${localize(`attr.${title}`) || title}"
        >
          <div slot="trigger">
            <span class="icon-title">
              ${!value_right
                ? value
                  ? this.formatValue(title, value)
                  : ''
                : ''}
              <ha-icon icon="${icon ? icon : this.getIcon(title)}"></ha-icon>
              ${value_right
                ? value
                  ? this.formatValue(title, value)
                  : ''
                : ''}
            </span>
          </div>
          ${attributes
            ? this.renderListItem(attributes, { selected, service })
            : ''}
        </ha-button-menu>
      </div>
    `;
  }

  /**
   * Generates the list items
   * @param {Object} attributes Object of attributes
   * @param {string} parent Parent element to naming children items
   * @return {TemplateResult}
   */
  renderListItem(attributes = {}, params = {}) {
    if (!attributes) {
      return nothing;
    }

    return html`
      ${Object.keys(attributes).map((item, i) =>
        this.isObject(attributes[item])
          ? this.renderListItem(attributes[item], {
              parent: item,
              selected: params.selected,
              service: params.service,
            })
          : html`
              ${i === 0 && params.parent
                ? html`
                    <mwc-list-item
                      class="label"
                      role="checkbox"
                      aria-checked="true"
                      >${localize('attr.' + params.parent)}</mwc-list-item
                    >
                  `
                : ``}
              <mwc-list-item
                class="${params.parent ? 'second-item' : ''}"
                ?activated=${params.selected == item}
                value="${item}"
                @click=${params.service
                  ? (e) => this.handleService(e, params.service)
                  : (e) => e.stopPropagation()}
              >
                ${localize('attr.' + item)
                  ? localize('attr.' + item) + ': '
                  : ''}
                ${this.formatValue(item, attributes[item])}
              </mwc-list-item>
            `
      )}
    `;
    // @click=${params.service?(e) => this.handleZone(e):''}
  }

  /**
   * Generates the toolbar button tip icon
   * @param {string} action Name of action
   * @param {Object} params Additional parameters
   * @param {string} params.attr Name of attribute to icon render
   * @param {string} params.title Title of button
   * @param {Boolean} params.isIcon Render a toolbar button (true) or an icon for tip (false)
   * @param {Boolean} params.isTitle Render a toolbar button with a title
   * @param {string} params.defaultService The default service
   * @param {Boolean} params.isRequest [=true] Requests an update which is processed asynchronously
   * @return {TemplateResult} Icon or Button or Button with title
   */
  renderButton(action, params = {}) {
    const icon = this.getIcon(params.attr || action);
    const isRequest = params.isRequest !== undefined ? params.isRequest : true;

    if (params.isIcon) {
      return html`
        <div
          class="tip"
          title="${localize('action.' + action)}"
          @click="${this.handleAction(params.defaultService || action, {
            isRequest: isRequest,
          })}"
        >
          <ha-icon icon="${icon}"></ha-icon>
        </div>
      `;
    } else {
      return !params.isTitle
        ? html`
            <ha-icon-button
              label="${localize('action.' + action)}"
              @click="${this.handleAction(params.defaultService || action, {
                isRequest: isRequest,
              })}"
            >
              <ha-icon icon="${icon}"></ha-icon>
            </ha-icon-button>
          `
        : html`
            <ha-button
              @click="${this.handleAction(action)}"
              title="${localize('action.' + (params.title || action))}"
            >
              <ha-icon icon="${icon}"></ha-icon>
              ${localize('action.' + (params.title || action))}
            </ha-button>
          `;
    }
  }

  /**
   * Generates the Camera or Image
   * @param {string} state State used as a css class
   * @return {TemplateResult}
   */
  renderCameraOrImage(state) {
    if (this.compactView) {
      return nothing;
    }

    if (this.camera) {
      const camera = this.hass.states[this.config.camera];
      return camera && camera.attributes.entity_picture
        ? html`
            <img
              class="camera"
              src="${camera.attributes.entity_picture}&v=${Date.now()}"
              @click=${() => this.handleMore(this.config.camera)}
            />
          `
        : nothing;
    }

    if (this.image) {
      return html`
        <img
          class="landroid ${this.showAnimation ? state : ''}"
          src="${this.image}"
          @click="${() => this.handleMore()}"
        />
      `;
    }

    return nothing;
  }

  /**
   * Generates the Stats
   * @param {string} state State used as a css class
   * @return {TemplateResult}
   */
  renderStats(state) {
    const { stats = {} } = this.config;

    const statsList = stats[state] || stats.default || [];

    return statsList.map(
      ({ entity_id, attribute, value_template, unit, subtitle }) => {
        if (!entity_id && !attribute && !value_template) {
          return nothing;
        }

        const state = entity_id
          ? this.hass.states[entity_id].state
          : get(this.entity.attributes, attribute);

        const value = html`
          <ha-template
            hass=${this.hass}
            template=${value_template}
            value=${state}
            .variables=${{ value: state }}
          ></ha-template>
        `;

        return html`
          <div
            class="stats-block"
            title="${subtitle}"
            @click="${() => this.handleMore(entity_id)}"
          >
            <span class="stats-value">${value}</span>
            ${unit}
            <div class="stats-subtitle">${subtitle}</div>
          </div>
        `;
      }
    );
  }

  /**
   * Generates the Name
   * @return {TemplateResult}
   */
  renderName() {
    const { friendly_name } = this.getAttributes(this.entity);

    if (!this.showName) {
      return nothing;
    }

    return html`
      <div
        class="landroid-name"
        title="${friendly_name}"
        @click="${() => this.handleMore()}"
      >
        ${friendly_name}
      </div>
    `;
  }

  /**
   * Generate the Status
   * @return {TemplateResult}
   */
  renderStatus() {
    if (!this.showStatus) {
      return nothing;
    }

    const { status } = this.getAttributes(this.entity);
    let localizedStatus = localize(`status.${status}`) || status;

    switch (status) {
      case 'rain_delay':
        {
          const { rain_sensor } = this.getAttributes(this.entity);
          localizedStatus += ` (${
            this.formatValue('remaining', rain_sensor['remaining']) || ''
          })`;
        }
        break;

      case 'mowing':
        {
          const { zone } = this.getAttributes(this.entity);
          localizedStatus += ` - ${localize('attr.zone') || ''} ${
            zone['current'] + 1
          }`;
        }
        break;

      case 'error':
        {
          const { error } = this.getAttributes(this.entity);
          if (error['id'] > 0) {
            localizedStatus += ` ${error['id']}: ${
              localize('error.' + error['description']) ||
              error['description'] ||
              ''
            }`;
          }
        }
        break;

      case 'docked':
      case 'idle':
        {
          const { next_scheduled_start } = this.getAttributes(this.entity);
          if (next_scheduled_start) {
            localizedStatus += ` - ${
              localize('attr.next_scheduled_start') || ''
            } ${
              this.formatValue('next_scheduled_start', next_scheduled_start) ||
              ''
            }`;
          }
        }
        break;

      default:
        break;
    }

    return html`
      <div
        class="status"
        @click="${() => this.handleMore()}"
        title="${localizedStatus}"
      >
        <span class="status-text"> ${localizedStatus} </span>
        <mwc-circular-progress
          .indeterminate=${this.requestInProgress}
          density="-5"
        ></mwc-circular-progress>
      </div>
    `;
  }

  renderConfigbar() {
    if (!this.showConfigbar) {
      return nothing;
    }

    return html`
      <div class="configbar">
        ${this.renderListMenu('delay')}
        ${this.renderButton('partymode', {
          attr: 'party_mode_enabled',
          isIcon: true,
          isRequest: false,
        })}
        ${this.renderButton('lock', {
          attr: 'locked',
          isIcon: true,
          isRequest: false,
        })}
        ${this.renderListMenu('zone')}
        <div
          class="tip"
          title="${localize('action.config')}"
          @click="${() => (this.showConfigPanel = !this.showConfigPanel)}"
        >
          <ha-icon icon="mdi:numeric"></ha-icon>
        </div>
        <!-- ${this.renderListMenu('zone')} -->
      </div>
    `;
  }

  renderToolbar(state) {
    if (!this.showToolbar) {
      return nothing;
    }

    switch (state) {
      case 'initializing':
      case 'mowing':
      case 'starting':
      case 'zoning': {
        return html`
          <div class="toolbar">
            ${this.renderButton('pause', { isTitle: true })}
            ${this.renderButton('return_to_base', { isTitle: true })}
          </div>
        `;
      }

      case 'edgecut': {
        return html`
          <div class="toolbar">
            ${this.renderButton('pause', { attr: 'edgecut', isTitle: true })}
            ${this.renderButton('return_to_base', { isTitle: true })}
          </div>
        `;
      }

      case 'paused': {
        return html`
          <div class="toolbar">
            <ha-button
              @click="${this.handleAction('resume', {
                defaultService: 'start',
              })}"
              title="${localize('action.resume')}"
            >
              <ha-icon icon="mdi:play"></ha-icon>
              ${localize('action.continue')}
            </ha-button>
            ${this.renderButton('edgecut', { isTitle: true })}
            ${this.renderButton('return_to_base', { isTitle: true })}
          </div>
        `;
      }

      case 'returning': {
        return html`
          <div class="toolbar">
            <ha-button
              @click="${this.handleAction('resume', {
                defaultService: 'start',
              })}"
              title="${localize('action.resume')}"
            >
              <ha-icon icon="mdi:play"></ha-icon>
              ${localize('action.continue')}
            </ha-button>
            ${this.renderButton('pause', 'pause', false)}
          </div>
        `;
      }

      case 'docked':
      case 'idle':
      case 'rain_delay':
      default: {
        const { shortcuts = [] } = this.config;

        const buttons = shortcuts.map(
          ({ name, service, icon, service_data }) => {
            const execute = () => {
              this.callAction({ service, service_data });
            };
            return html`
              <ha-icon-button label="${name}" @click="${execute}">
                <ha-icon icon="${icon}"></ha-icon>
              </ha-icon-button>
            `;
          }
        );

        const dockButton = html`${this.renderButton('return_to_base')}`;

        return html`
          <div class="toolbar">
            ${this.renderButton('start')} ${this.renderButton('edgecut')}
            ${state === 'idle' ? dockButton : ''}
            <div class="fill-gap"></div>
            ${buttons}
          </div>
        `;
      }
    }
  }

  renderConfigPanel() {
    if (!this.showConfigPanel) {
      return nothing;
    }

    return html`
      <div class="configpanel">
        <h1 class="card-header">
          <div class="name">${localize('action.config')}</div>
        </h1>

        ${this.renderListMenu('delay')}
        ${this.renderButton('partymode', {
          attr: 'party_mode_enabled',
          isIcon: true,
          isRequest: false,
        })}
        ${this.renderButton('lock', {
          attr: 'locked',
          isIcon: true,
          isRequest: false,
        })}
        ${this.renderListMenu('zone')}
        <!-- ${this.renderListMenu('zone')} -->
        <ha-card>
          <hui-entities-card>
            <div id="states" class="card-content">
              <div>
                <hui-input-number-entity-row>
                  <hui-generic-entity-row no-secondary="">
                    <div class="flex">
                      <ha-slider
                        pin=""
                        ignore-bar-touch=""
                        dir="ltr"
                        role="slider"
                        tabindex="0"
                        value="75"
                        aria-valuemin="0"
                        aria-valuemax="90"
                        aria-valuenow="75"
                        aria-disabled="false"
                      ></ha-slider>
                      <span class="state">75,0 min </span>
                    </div>
                  </hui-generic-entity-row>
                </hui-input-number-entity-row>
              </div>
            </div>
          </hui-entities-card>
        </ha-card>
      </div>
    `;
  }

  render() {
    if (!this.entity) {
      return html`
        <ha-card>
          <div class="preview not-available">
            <div class="metadata">
              <div class="not-available">
                ${localize('common.not_available')}
              </div>
            </div>
          </div>
        </ha-card>
      `;
    }

    // const { state, daily_progress } = this.getAttributes(this.entity);
    const { state, daily_progress } = this.getAttributes(this.entity);

    return html`
      <ha-card>
        <div class="preview">
          <div class="header">
            <div class="tips">
              ${this.renderListMenu('rssi')} ${this.renderListMenu('stats')}
              <!-- ${this.renderListMenu('blades')} -->
              ${this.renderListMenu('battery')}
            </div>
            <!-- <ha-icon-button
              class="more-info"
              icon="hass:dots-vertical"
              more-info="true"
              @click="${() => this.handleMore()}">
              <ha-icon icon="mdi:dots-vertical"></ha-icon>
            </ha-icon-button> -->
          </div>

          <!-- <div class="metadata"> -->
          <!-- <div style="position: absolute; background: var(--vc-background); z-index: 1;">
            <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
            <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
            <p>Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
          </div> -->
          ${this.renderCameraOrImage(state)}
          <!-- </div> -->
          <div class="metadata">
            ${this.renderName()} ${this.renderStatus()}
          </div>

          <div class="stats">${this.renderStats(state)}</div>
        </div>

        ${this.renderConfigbar(state)} ${this.renderToolbar(state)}
        ${this.renderConfigPanel()}

        <paper-progress
          id="landroidProgress"
          title="${localize('attr.daily_progress')}: ${this.formatValue(
            'daily_progress',
            daily_progress
          )}"
          aria-hidden="true"
          role="progressbar"
          value="${daily_progress}"
          aria-valuenow="${daily_progress}"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-disabled="false"
          style="touch-action: auto;"
        ></paper-progress>
      </ha-card>
    `;
  }
}

customElements.define('landroid-card', LandroidCard);

window.customCards = window.customCards || [];
window.customCards.push({
  preview: true,
  type: 'landroid-card',
  name: localize('common.name'),
  description: localize('common.description'),
});
