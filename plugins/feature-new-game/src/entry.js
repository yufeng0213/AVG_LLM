const NewGameFeatureEntry = {
  id: 'new-game',
  mount() {
    return {
      type: 'action',
      action: {
        type: 'new-game-dialog',
      },
    }
  },
}

export default NewGameFeatureEntry
