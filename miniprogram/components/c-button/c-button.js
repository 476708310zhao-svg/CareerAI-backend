Component({
  properties: {
    type:     { type: String,  value: 'primary'  }, // primary | secondary | danger | ghost
    size:     { type: String,  value: 'default'  }, // default | small
    block:    { type: Boolean, value: true        }, // full width
    disabled: { type: Boolean, value: false       },
    loading:  { type: Boolean, value: false       },
    openType: { type: String,  value: ''          }, // share | ...
  },
  methods: {}
})
